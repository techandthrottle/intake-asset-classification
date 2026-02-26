import os
import json
import google.generativeai as genai
from firebase_functions import https_fn
from firebase_admin import initialize_app
from werkzeug.wrappers import Request
import prompts
import uuid
from google.cloud import storage
from google.oauth2 import service_account # ADDED
import generate_premiere_project

initialize_app()

# The Gemini API key will be automatically picked up from GOOGLE_API_KEY or GEMINI_API_KEY environment variables.
genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))

def _set_cors_headers(response):
    """Sets CORS headers for the given response."""
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Max-Age'] = '3600'
    return response

def transcribe_audio(audio_data: bytes) -> str:
    """
    Transcribes the given audio data using the Gemini API.
    """
    model = genai.GenerativeModel('gemini-2.5-pro')
    response = model.generate_content([prompts.TRANSCRIPTION_PROMPT, {"mime_type": "audio/mpeg", "data": audio_data}])
    return response.text

def segment_audio(transcription: str) -> list:
    """
    Segments the transcription into clips using the Gemini API.
    """
    model = genai.GenerativeModel('gemini-2.5-pro')
    # num_clips and duration are hardcoded in the prompt now, so no need to format
    prompt = prompts.SEGMENTATION_PROMPT_TEMPLATE 
    response = model.generate_content([prompt, transcription], generation_config={"response_mime_type": "application/json"})
    
    try:
        segments = json.loads(response.text)
        return segments
    except json.JSONDecodeError as e:
        print(f"Error parsing segmentation response directly: {e}")
        print(f"Attempting to extract JSON from markdown. Raw response: {response.text}")
        try:
            # Attempt to extract JSON from markdown code blocks
            segments = extract_json_from_markdown(response.text)
            if segments:
                return segments
            else:
                raise ValueError("No JSON found in markdown format.")
        except Exception as markdown_e:
            print(f"Error extracting JSON from markdown: {markdown_e}")
            raise ValueError("Failed to parse segmentation response as JSON after multiple attempts.")


def extract_json_from_markdown(text: str) -> dict | list | None:
    """
    Extracts JSON content from a string that might contain markdown code blocks.
    """
    # Using a more robust regex to handle potential leading/trailing text
    match = re.search(r"```json\n(.*?)\n```", text, re.DOTALL)
    if match:
        json_str = match.group(1)
        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            return None
    
    # If no markdown block, try to parse directly
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None

@https_fn.on_request(memory=2048, timeout_sec=540)
def process_audio_py(req: https_fn.Request) -> https_fn.Response:
    """
    Processes an audio file by transcribing and segmenting it,
    then generates Premiere Pro XML files and uploads them to GCS.
    Expects a multipart/form-data request with 'audio' file, and optional
    'video_filename' and 'video_metadata' (as JSON string) fields.
    """
    # Load service account credentials from environment variable for signing
    gcs_service_account_key_json = os.environ.get("GCLOUD_SERVICE_ACCOUNT_KEY")
    if not gcs_service_account_key_json:
        print("GCLOUD_SERVICE_ACCOUNT_KEY environment variable not set.")
        response = https_fn.Response("GCLOUD_SERVICE_ACCOUNT_KEY environment variable not set.", status=500)
        return _set_cors_headers(response)

    try:
        credentials_info = json.loads(gcs_service_account_key_json)
        credentials = service_account.Credentials.from_service_account_info(credentials_info)
        storage_client = storage.Client(credentials=credentials)
    except Exception as e:
        print(f"Error loading service account credentials: {e}")
        response = https_fn.Response(f"Error loading service account credentials: {e}", status=500)
        return _set_cors_headers(response)

    # Get the GCS bucket name
    bucket_name = "tmp-asset-classification"

    # Handle preflight requests
    if req.method == 'OPTIONS':
        response = https_fn.Response("", status=204)
        return _set_cors_headers(response)

    if not os.environ.get("GOOGLE_API_KEY"):
        response = https_fn.Response("GOOGLE_API_KEY environment variable not set.", status=500)
        return _set_cors_headers(response)

    # Use werkzeug to handle multipart request
    werkzeug_req = Request(req.environ)

    # Get audio file
    audio_file = werkzeug_req.files.get('audio')
    if not audio_file:
        response = https_fn.Response("No audio file provided in the 'audio' field.", status=400)
        return _set_cors_headers(response)
    audio_data = audio_file.read()

    # Get optional video_filename and video_metadata
    video_filename = werkzeug_req.form.get('video_filename', 'input_audio.mp3')
    
    # Using the approved default metadata
    default_video_metadata = {
        "frame_rate": 29.97,
        "width": 1920,
        "height": 1080,
        "audio": {
            "sample_rate": 48000,
            "channels": 2
        },
        "duration": 0 # Will be inferred from segmentation_output if 0
    }
    
    video_metadata_str = werkzeug_req.form.get('video_metadata')
    if video_metadata_str:
        try:
            # Merge provided metadata with defaults
            provided_metadata = json.loads(video_metadata_str)
            video_metadata = {**default_video_metadata, **provided_metadata}
            # Handle nested audio dict if provided
            if 'audio' in provided_metadata and isinstance(provided_metadata['audio'], dict):
                video_metadata['audio'] = {**default_video_metadata['audio'], **provided_metadata['audio']}
        except json.JSONDecodeError:
            response = https_fn.Response("Invalid 'video_metadata' JSON format.", status=400)
            return _set_cors_headers(response)
    else:
        video_metadata = default_video_metadata

    try:
        # Step 1: Transcribe
        transcription = transcribe_audio(audio_data)

        # Step 2: Segment
        segmentation = segment_audio(transcription)

        # Step 3: Generate Premiere Pro XML and upload to GCS
        session_id = str(uuid.uuid4())
        
        # Ensure the bucket exists and is accessible
        try:
            storage_client.get_bucket(bucket_name)
        except Exception as e:
            print(f"Error accessing GCS bucket {bucket_name}: {e}")
            response = https_fn.Response(f"Error accessing GCS bucket: {e}", status=500)
            return _set_cors_headers(response)

        xml_urls = generate_premiere_project.create_premiere_project(
            segmentation_output=segmentation,
            video_metadata=video_metadata,
            video_filename=video_filename,
            client=storage_client,
            bucket_name=bucket_name,
            session_id=session_id
        )

        # Return results
        result = {
            "transcription": transcription,
            "xml_urls": xml_urls
        }
        response = https_fn.Response(json.dumps(result), content_type="application/json")
        return _set_cors_headers(response)

    except Exception as e:
        print(f"An error occurred: {e}")
        response = https_fn.Response(f"An internal error occurred: {e}", status=500)
        return _set_cors_headers(response)
import os
import json
import re
import datetime
import urllib.parse
import google.generativeai as genai
from firebase_functions import https_fn
from firebase_admin import initialize_app
from werkzeug.wrappers import Request
import prompts
import uuid
from google.cloud import storage
from google.oauth2 import service_account # ADDED
import generate_premiere_project
import requests

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
    print("--- Stage: Transcription ---")
    model = genai.GenerativeModel('gemini-2.5-pro')
    response = model.generate_content([prompts.TRANSCRIPTION_PROMPT, {"mime_type": "audio/mpeg", "data": audio_data}])
    print("--- Transcription complete ---")
    return response.text

def segment_audio(transcription: str, num_clips: int, duration: int) -> list:
    """
    Segments the transcription into clips using the Gemini API.
    """
    print(f"--- Stage: Segmentation (num_clips={num_clips}, duration={duration}) ---")
    model = genai.GenerativeModel('gemini-2.5-pro')
    prompt = prompts.SEGMENTATION_PROMPT_TEMPLATE.format(num_clips=num_clips, duration=duration)
    
    print("--- Sending Prompt to Gemini ---")
    print(prompt)
    print("--- End of Prompt ---")
    
    response = model.generate_content([prompt, transcription], generation_config={"response_mime_type": "application/json"})
    
    try:
        segments = json.loads(response.text)
        print("--- Segmentation successful ---")
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
    Processes an audio URL by transcribing and segmenting it,
    then generates Premiere Pro XML files and uploads them to GCS.
    Expects a JSON or multipart/form-data request with 'audio_url', and optional
    'num_clips', 'duration', 'video_filename', and 'video_metadata' fields.
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

    # Use werkzeug to handle form/multipart
    werkzeug_req = Request(req.environ)
    
    # Try to get data from JSON first, then form
    try:
        data = req.get_json(silent=True) or {}
    except:
        data = {}
    
    # Get audio_url
    audio_url = data.get('audio_url') or werkzeug_req.form.get('audio_url')
    if not audio_url:
        response = https_fn.Response("No 'audio_url' provided.", status=400)
        return _set_cors_headers(response)

    # Get optional fields
    video_filename = data.get('video_filename') or werkzeug_req.form.get('video_filename', 'input_audio.mp3')
    num_clips = data.get('num_clips') or werkzeug_req.form.get('num_clips', 1)
    duration = data.get('duration') or werkzeug_req.form.get('duration', 30)

    # Download audio data
    try:
        print(f"--- Stage: Downloading audio from {audio_url} ---")
        # Check if it's a GCS URL for our own bucket
        gcs_prefix = f"https://storage.googleapis.com/{bucket_name}/"
        if audio_url.startswith(gcs_prefix):
            # Extract and decode the blob name (e.g., %20 to space)
            blob_name = urllib.parse.unquote(audio_url.replace(gcs_prefix, ""))
            print(f"--- Downloading from GCS Bucket: {bucket_name}, Blob: {blob_name} ---")
            bucket = storage_client.bucket(bucket_name)
            blob = bucket.blob(blob_name)
            audio_data = blob.download_as_bytes()
        else:
            # Fallback for external URLs
            download_response = requests.get(audio_url, timeout=120)
            download_response.raise_for_status()
            audio_data = download_response.content
        print(f"--- Download complete ({len(audio_data)} bytes) ---")
    except Exception as e:
        print(f"Error downloading audio: {e}")
        response = https_fn.Response(f"Failed to download audio from URL: {e}", status=400)
        return _set_cors_headers(response)

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
    
    video_metadata_raw = data.get('video_metadata') or werkzeug_req.form.get('video_metadata')
    if video_metadata_raw:
        try:
            # Handle both dict and JSON string
            if isinstance(video_metadata_raw, str):
                provided_metadata = json.loads(video_metadata_raw)
            else:
                provided_metadata = video_metadata_raw
            
            video_metadata = {**default_video_metadata, **provided_metadata}
            # Handle nested audio dict if provided
            if 'audio' in provided_metadata and isinstance(provided_metadata['audio'], dict):
                video_metadata['audio'] = {**default_video_metadata['audio'], **provided_metadata['audio']}
        except (json.JSONDecodeError, TypeError):
            response = https_fn.Response("Invalid 'video_metadata' format.", status=400)
            return _set_cors_headers(response)
    else:
        video_metadata = default_video_metadata

    try:
        # Step 1: Transcribe
        transcription = transcribe_audio(audio_data)

        # Step 2: Segment
        segmentation = segment_audio(transcription, num_clips, duration)

        # Step 3: Generate Premiere Pro XML and upload to GCS
        session_id = str(uuid.uuid4())
        
        # Ensure the bucket exists and is accessible
        try:
            storage_client.get_bucket(bucket_name)
        except Exception as e:
            print(f"Error accessing GCS bucket {bucket_name}: {e}")
            response = https_fn.Response(f"Error accessing GCS bucket: {e}", status=500)
            return _set_cors_headers(response)

        clips = generate_premiere_project.create_premiere_project(
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
            "clips": clips
        }
        response = https_fn.Response(json.dumps(result), content_type="application/json")
        return _set_cors_headers(response)

    except Exception as e:
        print(f"An error occurred: {e}")
        response = https_fn.Response(f"An internal error occurred: {e}", status=500)
        return _set_cors_headers(response)

@https_fn.on_request(memory=256, timeout_sec=60)
def generate_upload_url(req: https_fn.Request) -> https_fn.Response:
    """
    Generates a V4 signed URL for uploading a file to GCS.
    Expects 'filename' and 'content_type' in the request JSON.
    """
    # Handle CORS
    if req.method == 'OPTIONS':
        response = https_fn.Response("", status=204)
        return _set_cors_headers(response)

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

    # Get optional/required fields from request
    try:
        data = req.get_json(silent=True) or {}
    except:
        data = {}

    filename = data.get('filename')
    content_type = data.get('content_type', 'application/octet-stream')

    if not filename:
        response = https_fn.Response("No 'filename' provided.", status=400)
        return _set_cors_headers(response)

    # The GCS bucket name
    bucket_name = "tmp-asset-classification"
    blob_name = f"uploads/{uuid.uuid4()}-{filename}"

    try:
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(blob_name)

        # Generate signed URL for PUT request
        url = blob.generate_signed_url(
            version="v4",
            expiration=datetime.timedelta(minutes=15),
            method="PUT",
            content_type=content_type,
        )

        # Result includes the upload URL and the public URL for subsequent processing
        result = {
            "upload_url": url,
            "file_path": blob_name,
            "public_url": f"https://storage.googleapis.com/{bucket_name}/{blob_name}"
        }

        response = https_fn.Response(json.dumps(result), content_type="application/json")
        return _set_cors_headers(response)

    except Exception as e:
        print(f"An error occurred generating signed URL: {e}")
        response = https_fn.Response(f"An internal error occurred: {e}", status=500)
        return _set_cors_headers(response)

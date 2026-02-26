import xml.etree.ElementTree as ET
from xml.dom import minidom
import os
import re
from google.cloud import storage
import datetime # ADDED

def generate_premiere_xml(object_name, video_metadata, segments_to_keep, video_filename, client=None, bucket_name=None):
    frame_rate = video_metadata.get("frame_rate", 29.97)
    width = video_metadata.get("width", 1920)
    height = video_metadata.get("height", 1080)
    audio_sample_rate = video_metadata.get("audio", {}).get("sample_rate", 48000)
    audio_channels = video_metadata.get("audio", {}).get("channels", 2)
    video_duration_frames = int(video_metadata.get("duration", 0) * frame_rate)

    xmeml = ET.Element("xmeml", version="4")
    sequence = ET.SubElement(xmeml, "sequence", id="sequence-1")
    ET.SubElement(sequence, "name").text = os.path.splitext(video_filename)[0]
    
    rate = ET.SubElement(sequence, "rate")
    ET.SubElement(rate, "timebase").text = str(int(frame_rate))
    ET.SubElement(rate, "ntsc").text = "TRUE"

    media = ET.SubElement(sequence, "media")
    video = ET.SubElement(media, "video")
    video_format = ET.SubElement(video, "format")
    video_sample_char = ET.SubElement(video_format, "samplecharacteristics")
    ET.SubElement(video_sample_char, "width").text = str(width)
    ET.SubElement(video_sample_char, "height").text = str(height)
    ET.SubElement(video_sample_char, "anamorphic").text = "FALSE"
    ET.SubElement(video_sample_char, "pixelaspectratio").text = "square"
    ET.SubElement(video_sample_char, "fielddominance").text = "none"
    ET.SubElement(video_sample_char, "colordepth").text = "24"
    v_rate = ET.SubElement(video_sample_char, "rate")
    ET.SubElement(v_rate, "timebase").text = str(int(frame_rate))
    ET.SubElement(v_rate, "ntsc").text = "TRUE"

    video_track = ET.SubElement(video, "track")
    
    audio = ET.SubElement(media, "audio")
    ET.SubElement(audio, "numOutputChannels").text = str(audio_channels)
    audio_format = ET.SubElement(audio, "format")
    audio_sample_char = ET.SubElement(audio_format, "samplecharacteristics")
    ET.SubElement(audio_sample_char, "depth").text = "16"
    ET.SubElement(audio_sample_char, "samplerate").text = str(audio_sample_rate)
    audio_track = ET.SubElement(audio, "track")

    timeline_cursor = 0
    clip_counter = 1

    file_id_map = {}
    file_counter = 1

    for segment in segments_to_keep:
        in_point = int(segment['start'] * frame_rate)
        out_point = int(segment['end'] * frame_rate)
        clip_duration = out_point - in_point

        # --- Video Clip --- 
        video_clipitem = ET.SubElement(video_track, "clipitem", id=f"clipitem-{clip_counter}")
        ET.SubElement(video_clipitem, "name").text = video_filename
        ET.SubElement(video_clipitem, "enabled").text = "TRUE"
        ET.SubElement(video_clipitem, "duration").text = str(clip_duration)
        ET.SubElement(video_clipitem, "start").text = str(timeline_cursor)
        ET.SubElement(video_clipitem, "end").text = str(timeline_cursor + clip_duration)
        ET.SubElement(video_clipitem, "in").text = str(in_point)
        ET.SubElement(video_clipitem, "out").text = str(out_point)

        if video_filename not in file_id_map:
            file_id_map[video_filename] = f"file-{file_counter}"
            file_counter += 1
        
        file_id = file_id_map[video_filename]
        file_element = ET.SubElement(video_clipitem, "file", id=file_id)

        if file_id == f"file-{file_counter-1}": # Only add full file info for the first time
            ET.SubElement(file_element, "name").text = video_filename
            ET.SubElement(file_element, "pathurl").text = video_filename
            ET.SubElement(file_element, "duration").text = str(video_duration_frames)
            f_rate = ET.SubElement(file_element, "rate")
            ET.SubElement(f_rate, "timebase").text = str(int(frame_rate))
            ET.SubElement(f_rate, "ntsc").text = "TRUE"
            f_media = ET.SubElement(file_element, "media")
            f_video = file_element.find(".//media/video")
            if f_video is None:
                f_video = ET.SubElement(f_media, "video")
            f_video_sample = ET.SubElement(f_video, "samplecharacteristics")
            ET.SubElement(f_video_sample, "width").text = str(width)
            ET.SubElement(f_video_sample, "height").text = str(height)
            f_audio = ET.SubElement(f_media, "audio")
            f_audio_sample = ET.SubElement(f_audio, "samplecharacteristics")
            ET.SubElement(f_audio_sample, "depth").text = "16"
            ET.SubElement(f_audio_sample, "samplerate").text = str(audio_sample_rate)
            ET.SubElement(f_audio, "channelcount").text = str(audio_channels)

        # --- Audio Clip --- 
        audio_clipitem = ET.SubElement(audio_track, "clipitem", id=f"clipitem-{clip_counter+1}")
        ET.SubElement(audio_clipitem, "name").text = video_filename
        ET.SubElement(audio_clipitem, "enabled").text = "TRUE"
        ET.SubElement(audio_clipitem, "duration").text = str(clip_duration)
        ET.SubElement(audio_clipitem, "start").text = str(timeline_cursor)
        ET.SubElement(audio_clipitem, "end").text = str(timeline_cursor + clip_duration)
        ET.SubElement(audio_clipitem, "in").text = str(in_point)
        ET.SubElement(audio_clipitem, "out").text = str(out_point)
        ET.SubElement(audio_clipitem, "file", id=file_id)

        # --- Linking --- 
        link1 = ET.SubElement(video_clipitem, "link")
        ET.SubElement(link1, "linkclipref").text = f"clipitem-{clip_counter}"
        ET.SubElement(link1, "mediatype").text = "video"
        ET.SubElement(link1, "trackindex").text = "1"
        ET.SubElement(link1, "clipindex").text = str(len(video_track))

        link2 = ET.SubElement(video_clipitem, "link")
        ET.SubElement(link2, "linkclipref").text = f"clipitem-{clip_counter+1}"
        ET.SubElement(link2, "mediatype").text = "audio"
        ET.SubElement(link2, "trackindex").text = "1"
        ET.SubElement(link2, "clipindex").text = str(len(audio_track))
        ET.SubElement(link2, "groupindex").text = "1"

        link3 = ET.SubElement(audio_clipitem, "link")
        ET.SubElement(link3, "linkclipref").text = f"clipitem-{clip_counter}"
        ET.SubElement(link3, "mediatype").text = "video"
        ET.SubElement(link3, "trackindex").text = "1"
        ET.SubElement(link3, "clipindex").text = str(len(video_track))

        link4 = ET.SubElement(audio_clipitem, "link")
        ET.SubElement(link4, "linkclipref").text = f"clipitem-{clip_counter+1}"
        ET.SubElement(link4, "mediatype").text = "audio"
        ET.SubElement(link4, "trackindex").text = "1"
        ET.SubElement(link4, "clipindex").text = str(len(audio_track))
        ET.SubElement(link4, "groupindex").text = "1"

        timeline_cursor += clip_duration
        clip_counter += 2

    ET.SubElement(sequence, "duration").text = str(timeline_cursor)

    xml_str = ET.tostring(xmeml, encoding='utf-8', method='xml')
    reparsed = minidom.parseString(xml_str)
    pretty_xml_str = reparsed.toprettyxml(indent="  ", encoding="utf-8").decode('utf-8')

    if client and bucket_name:
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(object_name)
        blob.upload_from_string(pretty_xml_str, content_type="application/xml")
        signed_url = blob.generate_signed_url(expiration=datetime.timedelta(minutes=30), response_disposition=f"attachment; filename=\"{os.path.basename(object_name)}\"") # 30 minutes, force download
        return signed_url
    else:
        # Fallback to returning the XML string for local testing/handling
        return pretty_xml_str


def parse_timestamp(timestamp_str: str) -> tuple[float, float]:
    """
    Parses a timestamp string of format "HH:MM:SS-HH:MM:SS" into start and end times in seconds.
    """
    def time_to_seconds(time_str: str) -> float:
        parts = list(map(int, time_str.split(':')))
        if len(parts) == 3:
            h, m, s = parts
        elif len(parts) == 2:
            h, m, s = 0, parts[0], parts[1]
        else:
            raise ValueError(f"Invalid time format: {time_str}")
        return h * 3600 + m * 60 + s

    start_time_str, end_time_str = timestamp_str.split('-')
    start_seconds = time_to_seconds(start_time_str)
    end_seconds = time_to_seconds(end_time_str)
    return start_seconds, end_seconds


def create_premiere_project(segmentation_output: list, video_metadata: dict, video_filename: str, client=None, bucket_name=None, session_id=None):
    """
    Processes segmentation output and generates a Premiere Pro XML file for each clip,
    uploading them to Google Cloud Storage and returning signed URLs.
    """
    if client and not bucket_name:
        raise ValueError("bucket_name must be provided if client is provided.")
    if client and not session_id:
        raise ValueError("session_id must be provided if client is provided.")

    generated_urls = []
    for clip_idx, clip_segments in enumerate(segmentation_output):
        segments_to_keep_for_this_clip = []
        max_end_time_for_this_clip = 0.0
        
        for segment_dict in clip_segments:
            # The key is dynamic (e.g., 'clip1text1'), so find the one that's not 'timestamp'
            text_key = next(key for key in segment_dict if key != 'timestamp')
            timestamp_str = segment_dict['timestamp']
            
            start_sec, end_sec = parse_timestamp(timestamp_str)
            segments_to_keep_for_this_clip.append({'start': start_sec, 'end': end_sec})
            max_end_time_for_this_clip = max(max_end_time_for_this_clip, end_sec)
        
        # Create a copy of video_metadata to modify duration for this specific clip
        clip_video_metadata = video_metadata.copy()
        clip_video_metadata["duration"] = max_end_time_for_this_clip

        object_name = f"tmp-asset-classification/{session_id}/output_clip_{clip_idx + 1}.xml" if client else f"output_clip_{clip_idx + 1}.xml"
        print(f"Generating Premiere Pro XML for Clip {clip_idx + 1} to {object_name}...")
        
        # Call generate_premiere_xml, which now returns a signed URL if client/bucket are provided
        signed_url_or_xml_string = generate_premiere_xml(object_name, clip_video_metadata, segments_to_keep_for_this_clip, video_filename, client, bucket_name)
        generated_urls.append(signed_url_or_xml_string)
        print(f"XML generation complete for Clip {clip_idx + 1}. URL/XML string: {signed_url_or_xml_string}")
    return generated_urls


if __name__ == "__main__":
    # Example Usage:
    # This segmentation_output would come from the Gemini API call
    sample_segmentation_output = [
        [
            {
                "clip1text1": "First segment text for clip 1",
                "timestamp": "00:00:05-00:00:10"
            },
            {
                "clip1text2": "Second segment text for clip 1",
                "timestamp": "00:00:12-00:00:17"
            }
        ],
        [
            {
                "clip2text1": "First segment text for clip 2",
                "timestamp": "00:00:20-00:00:25"
            }
        ],
        [
            {
                "clip3text1": "Another segment for clip 3",
                "timestamp": "00:00:30-00:00:35"
            }
        ]
    ]

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

    # output_xml_path is no longer used here as create_premiere_project handles individual file naming
    input_video_filename = "input_audio.mp3" # Placeholder for the original media file name

    create_premiere_project(sample_segmentation_output, default_video_metadata, input_video_filename)
    print("All XML files generation complete.")
TRANSCRIPTION_PROMPT = """Provide accurate transcription of the uploaded audio file. Provide transcription with its corresponding timestamp every 2 sentences. Format the timestamps should be like this sample - [01:48-01:54]. Write the Timestamp first then the transcript. Apply the right punctuations like hyphen for compound words, comma, period, etc. Do not use em dash. Do not use colon and semi colon. Consider correct capitalization and right spelling for Proper Nouns mentioned. Use a money sign with the right format if prices or amounts are mentioned. Apply the right symbols. Write the words in bold that sound like side comments from the speaker or from anyone on-cam or off-cam like the cameraman, sure stutters, wrong takes where a speaker usually changes his/her idea or repeat what was just said the better way, or filler words that we should remove."""

SEGMENTATION_PROMPT_TEMPLATE = """Create {{ num_clips }} separate standalone clips from the uploaded transcription. Each clip must have a total duration of approximately {{ duration }} seconds.
For each clip, select several segments from the transcript and combine them so the content feels cohesive and self-contained.

Output Requirements:
Your response MUST be a valid JSON array of arrays (a nested array).
The top-level array must contain exactly {{ num_clips }} inner arrays, each representing one clip.
Each inner array must contain the individual objects used to build that clip.
Dynamic Naming Convention: Within the objects, use the key format clipXtextY (where X is the clip number and Y is the segment number) and a timestamp key.
Return ONLY the JSON.

JSON FORMAT EXAMPLE:
[
[
{{
"clip1text1": "First segment text for clip 1",
"timestamp": "HH:MM:SS-HH:MM:SS"
}},
{{
"clip1text2": "Second segment text for clip 1",
"timestamp": "HH:MM:SS-HH:MM:SS"
}}
],
[
{{
"clip2text1": "First segment text for clip 2",
"timestamp": "HH:MM:SS-HH:MM:SS"
}}
]
]
"""

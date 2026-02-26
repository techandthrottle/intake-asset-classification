import os
import google.generativeai as genai

# Set your API key for local testing.
# In a deployed Firebase Function, this would be handled by environment variables.
# For local testing, ensure GOOGLE_API_KEY is set in your environment or replace with your key.
if "GOOGLE_API_KEY" not in os.environ:
    print("Please set the GOOGLE_API_KEY environment variable for local testing.")
    exit()

genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))

print("Available models supporting audio input for generateContent:")
for m in genai.list_models():
    # Check if the model supports 'generateContent'
    if "generateContent" in m.supported_generation_methods:
        # Check if the model supports 'audio' as an input type
        if "audio" in m.supported_input_types:
            print(f"- {m.name}")

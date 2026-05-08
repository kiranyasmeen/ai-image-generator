from http.server import BaseHTTPRequestHandler
from huggingface_hub import InferenceClient
import os
import io
from urllib.parse import urlparse, parse_qs

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # 1. Parse Parameters
        query = parse_qs(urlparse(self.path).query)
        prompt = query.get('prompt', ['a professional landscape'])[0]
        model_key = query.get('model', ['flux'])[0]

        # 2. Setup Client (Directly from user's snippet)
        hf_token = os.environ.get("HF_TOKEN") or os.environ.get("HF_API_KEY") or os.environ.get("HUGGINGFACE_API_KEY")
        
        # Model Map
        models = {
            'flux': 'black-forest-labs/FLUX.1-schnell',
            'turbo': 'stabilityai/sdxl-turbo'
        }
        target_model = models.get(model_key, models['flux'])

        try:
            client = InferenceClient(
                provider="together",
                api_key=hf_token,
            )

            # 3. Generate Image
            image = client.text_to_image(
                prompt,
                model=target_model,
            )

            # 4. Convert PIL to Bytes
            img_byte_arr = io.BytesIO()
            image.save(img_byte_arr, format='PNG')
            img_bytes = img_byte_arr.getvalue()

            # 5. Send Response
            self.send_response(200)
            self.send_header('Content-type', 'image/png')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(img_bytes)

        except Exception as e:
            self.send_response(503)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(f'{{"error": "{str(e)}"}}'.encode())

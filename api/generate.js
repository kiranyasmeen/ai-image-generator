/**
 * Vercel Serverless Function — /api/generate
 * TOGETHER AI OPTIMIZED VERSION
 */

const HF_IMAGE_MAP = {
  'flux':         'black-forest-labs/FLUX.1-schnell',
  'flux-realism': 'black-forest-labs/FLUX.1-dev',
  'turbo':        'stabilityai/sdxl-turbo',
  'any-dark':     'Lykon/DreamShaper_v8',
};

async function fetchFromHuggingFace(prompt, model, apiKey) {
  const hfModel = HF_IMAGE_MAP[model] || HF_IMAGE_MAP['flux'];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000); // 20s patience for Together

  try {
    console.log(`[TogetherAI] Calling HF with provider: together | Model: ${hfModel}`);
    const res = await fetch(`https://api-inference.huggingface.co/models/${hfModel}`, {
      method: 'POST',
      headers: {
        'Authorization':    `Bearer ${apiKey}`,
        'Content-Type':     'application/json',
        'x-wait-for-model': 'true',
        'x-provider':       'together', // FORCING TOGETHER AI PROVIDER
      },
      body: JSON.stringify({
        inputs:     prompt,
        parameters: { 
          num_inference_steps: 4,
          width: 1024,
          height: 1024
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`HF-Together Error ${res.status}: ${errorText.slice(0, 100)}`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) throw new Error('Response is not an image');

    const buffer = await res.arrayBuffer();
    return { buffer, contentType };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithFallback(prompt, model) {
  const fallbackModels = [model, 'flux', 'turbo', 'dreamshaper'];
  for (const m of fallbackModels) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const seed = Math.floor(Math.random() * 999999);
    try {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&seed=${seed}&model=${m}&nologo=true`;
      const res = await fetch(url, { signal: controller.signal });
      if (res.ok && res.headers.get('content-type')?.startsWith('image/')) {
        const buffer = await res.arrayBuffer();
        return { buffer, contentType: res.headers.get('content-type') };
      }
    } catch (e) {
      console.warn(`[Fallback] ${m} failed: ${e.message}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Creative engines saturated. Retrying...');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const prompt = req.query.prompt || 'a professional landscape';
  const model  = req.query.model  || 'flux';
  const HF_KEY = process.env.HF_API_KEY || process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY;

  try {
    let result;
    if (HF_KEY) {
      try {
        result = await fetchFromHuggingFace(prompt, model, HF_KEY);
      } catch (e) {
        console.error('[HF Failed]', e.message);
        result = await fetchWithFallback(prompt, model);
      }
    } else {
      result = await fetchWithFallback(prompt, model);
    }

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(Buffer.from(result.buffer));
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
}

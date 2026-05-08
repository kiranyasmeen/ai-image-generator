/**
 * Vercel Serverless Function — /api/generate
 *
 * Strategy: HF first (9 s timeout) → Pollinations fallback.
 * Returns binary image stream.
 */

const HF_IMAGE_MAP = {
  'flux':         'black-forest-labs/FLUX.1-schnell',
  'flux-realism': 'black-forest-labs/FLUX.1-dev',
  'turbo':        'stabilityai/sdxl-turbo',
  'any-dark':     'stablediffusionapi/realistic-vision-v6.0-b1-inpaint',
};

async function fetchFromHuggingFace(prompt, model) {
  const hfModel = HF_IMAGE_MAP[model] || HF_IMAGE_MAP['flux'];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);

  try {
    const res = await fetch(`https://api-inference.huggingface.co/models/${hfModel}`, {
      method: 'POST',
      headers: {
        'Authorization':    `Bearer ${process.env.HF_API_KEY || process.env.HF_TOKEN}`,
        'Content-Type':     'application/json',
        'x-wait-for-model': 'true',
      },
      body: JSON.stringify({
        inputs:     prompt,
        parameters: { num_inference_steps: 4, width: 1024, height: 1024 },
      }),
      signal: controller.signal,
    });

    if (res.status === 429) {
      const e = new Error('Rate limited');
      e.status = 429;
      throw e;
    }

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.startsWith('image/')) {
      throw new Error(`HF ${res.status}`);
    }

    const buffer = await res.arrayBuffer();
    return { buffer, contentType };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFromPollinations(prompt, model) {
  const modelOrder = [model, 'turbo', 'flux'].filter((m, i, a) => a.indexOf(m) === i);

  for (const m of modelOrder) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const seed = Math.floor(Math.random() * 999999);
    const url  = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`
               + `?width=1024&height=1024&seed=${seed}&model=${m}&nologo=true`;

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: controller.signal,
      });

      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.startsWith('image/')) {
        const buffer = await res.arrayBuffer();
        return { buffer, contentType };
      }
    } catch (e) {
      console.log(`[Pol] fallback failed for ${m}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('All models failed');
}

export default async function handler(req, res) {
  const prompt = req.query.prompt || 'a beautiful landscape';
  const model  = req.query.model  || 'flux';

  try {
    let result;
    if (process.env.HF_API_KEY || process.env.HF_TOKEN) {
      try {
        result = await fetchFromHuggingFace(prompt, model);
      } catch (e) {
        if (e.status === 429) {
          res.status(429).json({ error: 'Too many requests' });
          return;
        }
        result = await fetchFromPollinations(prompt, model);
      }
    } else {
      result = await fetchFromPollinations(prompt, model);
    }

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(Buffer.from(result.buffer));
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
}

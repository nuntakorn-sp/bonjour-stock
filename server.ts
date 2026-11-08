import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface CatalogEntry {
  code: string;
  name: string;
  nameEn?: string;
  kind?: string;
  unit?: string;
  cat?: string;
}

app.post('/api/ai/read-receive', async (req, res) => {
  try {
    const { imageDataUrl, rawText, catalog } = req.body as {
      imageDataUrl?: string | null;
      rawText?: string | null;
      catalog?: CatalogEntry[];
    };

    if (!imageDataUrl && (!rawText || !rawText.trim())) {
      res.status(400).json({ error: 'กรุณาแนบรูปภาพ ไฟล์ หรือข้อความรายการสินค้า' });
      return;
    }

    const ai = getAiClient();
    const catalogList = Array.isArray(catalog) ? catalog : [];
    const catalogContext = catalogList
      .map(
        (c) =>
          `${c.code}\t${c.name}${c.nameEn ? ` (${c.nameEn})` : ''}\t[${
            c.kind === 'material' ? 'วัตถุดิบ' : 'ขนม'
          }/${c.unit || 'ชิ้น'}]`
      )
      .join('\n');

    const parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [];

    if (imageDataUrl && typeof imageDataUrl === 'string') {
      const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        parts.push({
          inlineData: {
            mimeType: match[1],
            data: match[2],
          },
        });
      }
    }

    const promptText = [
      'อ่านข้อมูลรายการสินค้า/วัตถุดิบและจำนวนจากข้อมูลที่แนบมานี้ทั้งหมดอย่างละเอียดและครบถ้วนทุกรายการ เพื่อนำไปเพิ่มจำนวน "ยอดยกเข้า" ในระบบสต๊อกร้านเบเกอรี่ BONJOUR',
      '',
      'รายชื่อสินค้าที่มีอยู่ในระบบปัจจุบัน (รหัส\tชื่อสินค้า\tประเภท):',
      catalogContext || '(ไม่มีรายการในระบบ)',
      '',
      rawText ? `ข้อมูลจากไฟล์/ข้อความ:\n${rawText}\n` : '',
      'คำสั่งสำคัญ:',
      '1. อ่านทุกรายการที่มีจำนวนสินค้า ห้ามตกหล่นแม้แต่รายการเดียว',
      '2. จับคู่แต่ละรายการกับ "รายชื่อสินค้าที่มีอยู่ในระบบปัจจุบัน" ด้านบนให้แม่นยำที่สุด โดยดูจากรหัสสินค้า (เช่น 1001, 2003, 82004, M01-M26) หรือชื่อสินค้าภาษาไทย/อังกฤษ (แม้สะกดใกล้เคียงหรือย่อ)',
      '3. หากตรงกับสินค้าที่มีอยู่ในระบบ ให้ใส่ matchedCode เป็นรหัสสินค้าในระบบ และใส่ name เป็นชื่อสินค้าตามในระบบทุกตัวอักษร',
      '4. หากรหัสสินค้า (เช่น 1001, 4002, 82004) ปรากฏอยู่ในแถว ห้ามนำรหัสสินค้าไปใส่ในช่องจำนวน (doc หรือ act) เด็ดขาด',
      '5. ช่อง doc คือจำนวนตามเอกสาร/ใบสั่ง และช่อง act คือจำนวนรับจริง/ยอดยกเข้า หากเอกสารมีคอลัมน์จำนวนเพียงคอลัมน์เดียว ให้ใส่ค่าเดียวกันทั้งใน doc และ act',
      '6. หากมีรายการรหัสหรือชื่อเดียวกันซ้ำหลายบรรทัด ให้รวมจำนวนเข้าด้วยกัน',
    ].join('\n');

    parts.push({ text: promptText });

    const generatePromise = ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: { parts },
      config: {
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW,
        },
        systemInstruction:
          'คุณคือ AI ผู้เชี่ยวชาญด้านการอ่านใบรับสินค้า ใบส่งของ ตารางสต๊อก และจับคู่รายการสินค้าเข้ากับฐานข้อมูลร้าน BONJOUR อย่างแม่นยำ 100% ตอบกลับเป็น JSON ตามโครงสร้างที่กำหนดเท่านั้น',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              description: 'รายการสินค้าที่อ่านได้ทั้งหมดพร้อมจำนวนยอดยกเข้า',
              items: {
                type: Type.OBJECT,
                properties: {
                  matchedCode: {
                    type: Type.STRING,
                    description:
                      'รหัสสินค้าที่ตรงกับในระบบ (เช่น 1001, M01) หากเป็นสินค้าใหม่ที่ไม่มีในระบบให้ใส่ค่าว่าง ""',
                  },
                  name: {
                    type: Type.STRING,
                    description:
                      'ชื่อสินค้า (หากตรงกับในระบบให้ใช้ชื่อในระบบทันที)',
                  },
                  doc: {
                    type: Type.NUMBER,
                    description: 'จำนวนตามเอกสาร (หากมีคอลัมน์เดียวให้เท่ากับ act)',
                  },
                  act: {
                    type: Type.NUMBER,
                    description: 'จำนวนรับจริง / จำนวนที่จะเพิ่มเข้ายอดยกเข้า',
                  },
                },
                required: ['matchedCode', 'name', 'doc', 'act'],
              },
            },
            summary: {
              type: Type.STRING,
              description: 'สรุปผลการอ่านข้อมูลสั้นๆ ภาษาไทย',
            },
          },
          required: ['items'],
        },
      },
    });

    const timeoutMs = Number(process.env.AI_TIMEOUT_MS) || 45000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('AI_TIMEOUT')), timeoutMs)
    );

    const response = await Promise.race([generatePromise, timeoutPromise]);

    const jsonText = (response.text ?? '{"items":[]}').trim();
    const parsed = JSON.parse(jsonText);
    res.json({
      items: Array.isArray(parsed.items) ? parsed.items : [],
      summary: parsed.summary || '',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเรียกใช้ AI';
    const status =
      message === 'AI_TIMEOUT'
        ? 504
        : /GEMINI_API_KEY/.test(message)
        ? 500
        : 502;
    res.status(status).json({ items: [], summary: '', error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

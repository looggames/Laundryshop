
import { GoogleGenAI, Type } from "@google/genai";
import { Order } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export type MessageContext = 'RECEIVED' | 'READY' | 'REMINDER_24H' | 'REMINDER_48H' | 'REMINDER_1H';

export const generateSmartReminder = async (order: Order, context: MessageContext | number): Promise<string> => {
  // نصوص جاهزة مطابقة لطلبك تماماً لاستخدامها في حال فشل الذكاء الاصطناعي
  const fallbackMessages = {
    RECEIVED: `مرحباً ${order.customer_name} نود إعلامكم بأننا استلمنا طلبكم رقم ${order.order_number} ونحن نعمل عليه الآن لضمان تقديمه بأفضل جودة. إجمالي قيمة الطلب هي ${order.total.toFixed(2)} ريال سعودي. شكراً لاختياركم لنا ويسعدنا دائماً خدمتكم.`,
    READY: `مرحباً ${order.customer_name} نود إعلامكم بأن طلبكم رقم ${order.order_number} قد تم الانتهاء منه وهو جاهز تماماً وبانتظاركم لاستلامه الآن. إجمالي المبلغ هو ${order.total.toFixed(2)} ريال سعودي. يسعدنا حضوركم.`,
    REMINDER: `مرحباً ${order.customer_name}، نود تذكيركم بأن طلبكم رقم ${order.order_number} جاهز للاستلام. نسعد بزيارتكم.`
  };

  try {
    let specificContext = "";
    
    if (context === 'RECEIVED') {
      specificContext = `رسالة استلام طلب: "${fallbackMessages.RECEIVED}"`;
    } else if (context === 'READY') {
      specificContext = `رسالة جاهزية طلب: "${fallbackMessages.READY}"`;
    } else {
      specificContext = fallbackMessages.REMINDER;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `
        Generate a polite WhatsApp message in Arabic for a laundry customer.
        Context: ${specificContext}
        
        RULES:
        1. Use plain text only.
        2. Keep the same meaning and information as the provided context.
        3. Start with "مرحباً [Name]".
      `,
    });
    
    // إذا نجح الـ API نستخدم النتيجة، وإلا نستخدم النص الجاهز
    return response.text || (context === 'RECEIVED' ? fallbackMessages.RECEIVED : fallbackMessages.READY);
  } catch (error) {
    console.error("Gemini Error, using fallback:", error);
    // في حال وجود خطأ (مثل Netlify environment variables) نرجع النص المطلوب مباشرة
    if (context === 'RECEIVED') return fallbackMessages.RECEIVED;
    if (context === 'READY') return fallbackMessages.READY;
    return fallbackMessages.REMINDER;
  }
};

export const getFinancialSummary = async (orders: Order[], inventory: any[]): Promise<string> => {
  try {
    const totalRevenue = orders.reduce((acc, o) => acc + o.total, 0);
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze: Total Revenue ${totalRevenue} SAR. Summary in Arabic plain text.`,
    });
    return response.text || "المؤشرات المالية مستقرة.";
  } catch (error) {
    return "لا يمكن حالياً تحليل البيانات المالية.";
  }
};

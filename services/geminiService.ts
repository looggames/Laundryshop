
import { GoogleGenAI, Type } from "@google/genai";
import { Order } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export type MessageContext = 'RECEIVED' | 'READY' | 'REMINDER_24H' | 'REMINDER_48H' | 'REMINDER_1H';

export const generateSmartReminder = async (order: Order, context: MessageContext | number): Promise<string> => {
  try {
    let specificContext = "";
    
    if (context === 'RECEIVED') {
      specificContext = `رسالة استلام طلب: "مرحباً ${order.customer_name} نود إعلامكم بأننا استلمنا طلبكم رقم ${order.order_number} ونحن نعمل عليه الآن لضمان تقديمه بأفضل جودة. إجمالي قيمة الطلب هي ${order.total} ريال سعودي. شكراً لاختياركم لنا ويسعدنا دائماً خدمتكم."`;
    } else if (context === 'READY') {
      specificContext = `رسالة جاهزية طلب: "مرحباً ${order.customer_name} نود إعلامكم بأن طلبكم رقم ${order.order_number} قد تم الانتهاء منه وهو جاهز تماماً وبانتظاركم لاستلامه الآن. إجمالي المبلغ هو ${order.total} ريال سعودي. يسعدنا حضوركم."`;
    } else if (context === 'REMINDER_48H' || context === 48) {
      specificContext = "لقد مرت أكثر من 48 ساعة على جاهزية الطلب. النبرة تذكيرية جادة بضرورة الاستلام.";
    } else if (context === 'REMINDER_24H' || context === 24) {
      specificContext = "لقد مرت أكثر من 24 ساعة على جاهزية الطلب. النبرة تذكيرية لطيفة بأن الملابس جاهزة وتنتظر صاحبها.";
    } else {
      specificContext = "تذكير سريع بأن الملابس جاهزة للاستلام.";
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `
        Generate a polite and professional WhatsApp message in Arabic for a laundry customer based on the following context.
        Customer Name: ${order.customer_name}
        Order ID: ${order.order_number}
        Total Price: ${order.total} SAR
        
        CONTEXT: ${specificContext}
        
        RULES:
        1. Use ONLY plain text. NO asterisks (*), NO underscores (_), NO dashes (-).
        2. Keep the wording identical to the intent provided in the context.
        3. Make the message flow naturally in Arabic.
        4. The message must feel warm and helpful.
      `,
    });
    return response.text || "عزيزي العميل، نود إبلاغكم بتحديث بخصوص طلبكم رقم " + order.order_number;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "عزيزي العميل، نود إبلاغكم بتحديث بخصوص طلبكم. شكراً لثقتك بنا!";
  }
};

export const getFinancialSummary = async (orders: Order[], inventory: any[]): Promise<string> => {
  try {
    const totalRevenue = orders.reduce((acc, o) => acc + o.total, 0);
    const unpaidTotal = orders.filter(o => !o.is_paid).reduce((acc, o) => acc + o.total, 0);
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `
        Analyze this laundry business data and provide a short summary in Arabic:
        Total Revenue: ${totalRevenue} SAR
        Unpaid Orders Total: ${unpaidTotal} SAR
        Total Orders: ${orders.length}
        Provide business advice using plain text only. No formatting symbols.
      `,
    });
    return response.text || "المؤشرات المالية جيدة، ينصح بمتابعة تحصيل المبالغ غير المدفوعة.";
  } catch (error) {
    return "لا يمكن حالياً تحليل البيانات المالية.";
  }
};

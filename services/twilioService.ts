
import { Order, TwilioConfig } from "../types";

export const sendTwilioWhatsApp = async (order: Order, message: string, config: TwilioConfig): Promise<boolean> => {
  if (!config.enabled || !config.accountSid || !config.authToken || !config.fromNumber) {
    console.warn("Twilio is not configured or disabled.");
    return false;
  }

  const cleanPhone = order.customer_phone.replace(/\D/g, '');
  const toPhone = cleanPhone.startsWith('966') ? cleanPhone : `966${cleanPhone.replace(/^0/, '')}`;
  
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  
  const auth = btoa(`${config.accountSid}:${config.authToken}`);
  
  const body = new URLSearchParams();
  body.append('To', `whatsapp:+${toPhone}`);
  body.append('From', `whatsapp:${config.fromNumber}`);
  body.append('Body', message);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Twilio API Error:", errorData);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Twilio Network Error:", error);
    return false;
  }
};

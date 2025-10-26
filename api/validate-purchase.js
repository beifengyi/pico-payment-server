import axios from 'axios';

// 生产环境配置
const PICO_CONFIG = {
  APP_ID: process.env.PICO_APP_ID || 'your_pico_app_id',
  APP_SECRET: process.env.PICO_APP_SECRET || 'your_pico_app_secret',
  VALIDATION_URL: 'https://open-api.pico.cn/platform/serverapi/purchase/check'
};

// 内存存储（生产环境建议使用Redis）
const orderCache = new Map();

export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Version, X-Platform');
  
  // 处理预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // 只允许POST请求
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed',
      request_id: generateRequestId()
    });
  }

  const startTime = Date.now();
  const requestId = generateRequestId();
  
  try {
    console.log(`[${requestId}] 收到支付验证请求`);
    
    const { product_id, purchase_token, user_id, platform = 'pico', app_version, device_id } = req.body;

    // 参数验证
    if (!product_id || !purchase_token || !user_id) {
      console.warn(`[${requestId}] 缺少必要参数`);
      return res.json({
        success: false,
        message: '缺少必要参数: product_id, purchase_token, user_id',
        request_id: requestId
      });
    }

    // 检查重复订单
    const orderKey = `${user_id}_${purchase_token}`;
    if (orderCache.has(orderKey)) {
      console.warn(`[${requestId}] 重复订单: ${orderKey}`);
      return res.json({
        success: true,
        message: '重复订单（已处理过）',
        validated_product_id: product_id,
        is_duplicate: true,
        request_id: requestId,
        server_time: new Date().toISOString()
      });
    }

    let validationResult;
    
    if (platform === 'pico') {
      validationResult = await validatePicoPurchase(product_id, purchase_token, user_id, requestId);
    } else {
      validationResult = await validateSimulatedPurchase(product_id, purchase_token, user_id);
    }

    // 记录成功订单
    if (validationResult.success && !validationResult.is_duplicate) {
      orderCache.set(orderKey, {
        product_id,
        user_id,
        timestamp: Date.now()
      });
      // 清理过期订单（24小时）
      cleanupOldOrders();
    }

    const processingTime = Date.now() - startTime;
    console.log(`[${requestId}] 验证完成, 耗时: ${processingTime}ms, 结果: ${validationResult.success}`);
    
    res.json({
      ...validationResult,
      request_id: requestId,
      processing_time: processingTime
    });

  } catch (error) {
    console.error(`[${requestId}] 服务器错误:`, error);
    res.json({
      success: false,
      message: `服务器内部错误: ${error.message}`,
      request_id: requestId,
      server_time: new Date().toISOString()
    });
  }
}

// PICO支付验证
async function validatePicoPurchase(productId, purchaseToken, userId, requestId) {
  try {
    // 构建验证请求
    const requestData = {
      app_id: PICO_CONFIG.APP_ID,
      user_id: userId,
      product_id: productId,
      purchase_token: purchaseToken
    };

    // 生成签名（需要根据PICO文档实现）
    requestData.sign = generatePicoSignature(requestData);

    console.log(`[${requestId}] 调用PICO验证API:`, PICO_CONFIG.VALIDATION_URL);
    
    const response = await axios.post(PICO_CONFIG.VALIDATION_URL, requestData, {
      timeout: 8000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'PICO-Payment-Server/1.0'
      }
    });

    console.log(`[${requestId}] PICO API响应:`, response.data);

    if (response.data && response.data.ret === 0) {
      return {
        success: true,
        message: 'PICO支付验证成功',
        validated_product_id: productId,
        is_duplicate: false,
        server_time: new Date().toISOString()
      };
    } else {
      return {
        success: false,
        message: `PICO验证失败: ${response.data?.msg || `错误码: ${response.data?.ret}`}`,
        validated_product_id: productId,
        is_duplicate: false,
        server_time: new Date().toISOString()
      };
    }
  } catch (error) {
    console.error(`[${requestId}] PICO验证请求失败:`, error.message);
    
    // 根据错误类型返回不同的消息
    let errorMessage = '支付验证服务暂时不可用';
    if (error.code === 'ECONNABORTED') {
      errorMessage = '验证请求超时';
    } else if (error.response) {
      errorMessage = `PICO服务器错误: ${error.response.status}`;
    }
    
    return {
      success: false,
      message: errorMessage,
      validated_product_id: productId,
      is_duplicate: false,
      server_time: new Date().toISOString()
    };
  }
}

// 模拟支付验证（用于测试）
async function validateSimulatedPurchase(productId, purchaseToken, userId) {
  // 模拟处理延迟
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // 测试用的验证逻辑
  const isValid = purchaseToken.startsWith('simulated_purchase_token_') || 
                  purchaseToken.startsWith('test_');
  
  if (isValid) {
    return {
      success: true,
      message: '模拟支付验证成功',
      validated_product_id: productId,
      is_duplicate: false,
      server_time: new Date().toISOString()
    };
  } else {
    return {
      success: false,
      message: '模拟支付验证失败：无效的支付令牌',
      validated_product_id: productId,
      is_duplicate: false,
      server_time: new Date().toISOString()
    };
  }
}

// 生成PICO签名（需要根据PICO官方文档实现）
function generatePicoSignature(data) {
  // 注意：这里需要根据PICO官方文档实现正确的签名算法
  // 以下是示例代码，实际使用时需要替换为官方算法
  
  // 示例：按参数名排序后拼接
  const sortedKeys = Object.keys(data).sort();
  let signString = '';
  sortedKeys.forEach(key => {
    if (key !== 'sign') { // 排除sign参数本身
      signString += `${key}=${data[key]}&`;
    }
  });
  signString = signString.slice(0, -1); // 去除最后一个&
  
  // 使用HMAC-SHA256签名（需要Node.js crypto模块）
  // const crypto = require('crypto');
  // const hmac = crypto.createHmac('sha256', PICO_CONFIG.APP_SECRET);
  // hmac.update(signString);
  // return hmac.digest('hex');
  
  // 临时返回模拟签名
  console.warn('⚠️ 请实现正确的PICO签名算法');
  return 'demo_signature_' + Date.now();
}

// 清理过期订单
function cleanupOldOrders() {
  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  
  for (let [key, order] of orderCache.entries()) {
    if (now - order.timestamp > twentyFourHours) {
      orderCache.delete(key);
    }
  }
}

// 生成请求ID
function generateRequestId() {
  return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}
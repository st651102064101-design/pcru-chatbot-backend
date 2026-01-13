#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:36145';

async function test() {
  console.log('🧪 ทดสอบ Respond Endpoint ด้วย Gemini Conversation\n');

  try {
    // คำถาม 1
    console.log('❓ คำถามที่ 1: "มีหอพักไหม"');
    const response1 = await axios.post(`${BASE_URL}/chat/respond`, {
      message: 'มีหอพักไหม',
    });

    console.log('✅ Response:', response1.data.message || response1.data.alternatives[0]?.text?.substring(0, 100));
    console.log('📊 Source:', response1.data.source);
    console.log('📊 Session ID:', response1.data.sessionId || 'N/A', '\n');

    // คำถาม 2 (สำคัญ!)
    console.log('❓ คำถามที่ 2: "แล้วมีสำหรับผู้หญิงไหม"');
    const response2 = await axios.post(`${BASE_URL}/chat/respond`, {
      message: 'แล้วมีสำหรับผู้หญิงไหม',
    });

    console.log('✅ Response:', response2.data.message || response2.data.alternatives[0]?.text?.substring(0, 100));
    console.log('📊 Source:', response2.data.source, '\n');

    // คำถาม 3
    console.log('❓ คำถามที่ 3: "แล้วว่างกี่ห้อง"');
    const response3 = await axios.post(`${BASE_URL}/chat/respond`, {
      message: 'แล้วว่างกี่ห้อง',
    });

    console.log('✅ Response:', response3.data.message || response3.data.alternatives[0]?.text?.substring(0, 100));
    console.log('📊 Source:', response3.data.source, '\n');

    console.log('✅ ทดสอบเสร็จสิ้น!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response?.data) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

setTimeout(test, 2000);

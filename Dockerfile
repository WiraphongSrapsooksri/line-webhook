# ใช้ Node.js เวอร์ชันล่าสุดที่เสถียร
FROM node:18-slim

# สร้างไดเรกทอรีสำหรับแอพ
WORKDIR /usr/src/app

# คัดลอกไฟล์ package.json และ package-lock.json
COPY package*.json ./

# ติดตั้ง dependencies
RUN npm install

# คัดลอกซอร์สโค้ดทั้งหมด
COPY . .

# เปิดพอร์ต 3000
EXPOSE 3001

# คำสั่งเริ่มต้นแอพ
CMD ["npm", "start"]
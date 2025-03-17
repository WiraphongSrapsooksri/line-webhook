// scheduler.js
const cron = require("node-cron");
const { getConnection } = require("../config/database");
const sql = require("mssql");
const line = require("@line/bot-sdk");
const logger = require("../../logs/index");
const axios = require("axios");

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

if (!lineConfig.channelAccessToken || !lineConfig.channelSecret) {
  logger.error("Missing LINE_CHANNEL_ACCESS_TOKEN or LINE_CHANNEL_SECRET");
  process.exit(1);
}

const client = new line.Client(lineConfig);

// ตรวจสอบกำหนดการทุกนาที
cron.schedule("* * * * *", async () => {
  let pool;
  try {
    const now = new Date();
    logger.info(`Checking billing schedule at ${now}`);

    pool = await getConnection();

    // ดึงกำหนดการที่ active และถึงเวลาดำเนินการ
    const schedules = await pool.request().input("now", sql.DateTime2, now)
      .query(`
        SELECT id, billing_date, disable_date
        FROM billing_schedule
        WHERE is_active = 1
        AND (
          DATEADD(minute, -1, billing_date) <= @now AND billing_date >= @now
          OR DATEADD(minute, -1, disable_date) <= @now AND disable_date >= @now
        )
      `);

    if (!schedules.recordset.length) {
      logger.info("No billing schedule to process");
      return;
    }

    for (const schedule of schedules.recordset) {
      const billingTime = new Date(schedule.billing_date);
      const disableTime = new Date(schedule.disable_date);

      // ส่งข้อความเรียกเก็บเงิน
      if (now >= billingTime && now < new Date(billingTime.getTime() + 60000)) {
        logger.info(`Processing billing for schedule ${schedule.id}`);
        const users = await pool.request().query(`
          SELECT lum.line_user_id, lupc.required_amount, u9.username
          FROM line_users_main lum
          JOIN line_user_payment_config lupc ON lum.line_user_id = lupc.line_user_id
          JOIN userm9 u9 ON lupc.userm9_id = u9.id
        `);

        for (const user of users.recordset) {
          const message = {
            type: "text",
            text: `📢 ค่าบริการรายเดือน ${
              user.required_amount
            } THB\nกรุณาชำระภายใน ${disableTime.toLocaleString()} \nมิฉะนั้นระบบจะถูกปิดใช้งาน`,
          };
          await client.pushMessage(user.line_user_id, message);
          logger.info(`Billing message sent to ${user.line_user_id}`);
        }
      }

      // ปิดระบบสำหรับผู้ที่ยังไม่จ่าย
      if (now >= disableTime && now < new Date(disableTime.getTime() + 60000)) {
        logger.info(`Processing disable for schedule ${schedule.id}`);
        const users = await pool.request().query(`
          SELECT 
            lum.line_user_id,
            u9.username,
            lut.status,
            lut.trans_timestamp
          FROM line_users_main lum
          LEFT JOIN line_user_payment_config lupc ON lum.line_user_id = lupc.line_user_id
          LEFT JOIN userm9 u9 ON lupc.userm9_id = u9.id
          LEFT JOIN (
            SELECT line_user_id, status, trans_timestamp
            FROM line_user_transactions
            WHERE (line_user_id, trans_timestamp) IN (
              SELECT line_user_id, MAX(trans_timestamp)
              FROM line_user_transactions
              GROUP BY line_user_id
            )
          ) lut ON lum.line_user_id = lut.line_user_id
        `);

        for (const user of users.recordset) {
          const lastPaymentDate = user.trans_timestamp
            ? new Date(user.trans_timestamp)
            : null;
          const isPaidAfterBilling =
            lastPaymentDate &&
            lastPaymentDate >= billingTime &&
            user.status === "on";

          if (!isPaidAfterBilling) {
            await axios.put(process.env.STATUS_API_URL, {
              username: user.username,
              status: "off",
            });
            await client.pushMessage(user.line_user_id, {
              type: "text",
              text: "❌ ระบบของคุณถูกปิดใช้งานเนื่องจากยังไม่ชำระค่าบริการ",
            });
            logger.info(`Disabled system for ${user.line_user_id}`);
          }
        }
      }
    }
  } catch (error) {
    logger.error("Error in scheduler: " + error.message, {
      stack: error.stack,
    });
  } finally {
    if (pool) pool.close(); // ปิด connection เพื่อป้องกัน resource leak
  }
});

logger.info("Scheduler initialized with database-driven billing");

module.exports = cron;


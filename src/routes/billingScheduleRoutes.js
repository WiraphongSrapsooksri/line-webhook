const express = require('express');
const router = express.Router();
const { getConnection } = require('../config/database');
const sql = require('mssql');
const logger = require('../logger');

// ดึงรายการทั้งหมด
router.get('/', async (req, res) => {
  let pool;
  try {
    pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        id,
        billing_date,
        disable_date,
        description,
        is_active,
        created_at,
        updated_at
      FROM billing_schedule
      ORDER BY billing_date DESC
    `);
    res.json({ status: 'success', data: result.recordset });
  } catch (error) {
    logger.error('Error fetching billing schedules: ' + error.message, { stack: error.stack });
    res.status(500).json({ status: 'error', message: 'Failed to fetch billing schedules', error: error.message });
  } finally {
    if (pool) pool.close(); // ปิด connection เพื่อป้องกัน resource leak
  }
});

// ดึงรายการเดียวด้วย ID
router.get('/:id', async (req, res) => {
  let pool;
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid ID format' });
    }

    pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          id,
          billing_date,
          disable_date,
          description,
          is_active,
          created_at,
          updated_at
        FROM billing_schedule
        WHERE id = @id
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ status: 'error', message: 'Billing schedule not found' });
    }
    res.json({ status: 'success', data: result.recordset[0] });
  } catch (error) {
    logger.error(`Error fetching billing schedule ${req.params.id}: ${error.message}`, { stack: error.stack });
    res.status(500).json({ status: 'error', message: 'Failed to fetch billing schedule', error: error.message });
  } finally {
    if (pool) pool.close();
  }
});

// สร้างกำหนดการใหม่
router.post('/', async (req, res) => {
  let pool;
  try {
    const { billing_date, disable_date, description, is_active = true } = req.body;

    // Validation
    if (!billing_date || !disable_date) {
      return res.status(400).json({ status: 'error', message: 'Billing date and disable date are required' });
    }
    const billingDate = new Date(billing_date);
    const disableDate = new Date(disable_date);
    if (isNaN(billingDate.getTime()) || isNaN(disableDate.getTime())) {
      return res.status(400).json({ status: 'error', message: 'Invalid date format' });
    }
    if (billingDate >= disableDate) {
      return res.status(400).json({ status: 'error', message: 'Billing date must be before disable date' });
    }

    pool = await getConnection();
    const result = await pool.request()
      .input('billing_date', sql.DateTime2, billingDate)
      .input('disable_date', sql.DateTime2, disableDate)
      .input('description', sql.NVarChar, description || null)
      .input('is_active', sql.Bit, is_active)
      .query(`
        INSERT INTO billing_schedule (billing_date, disable_date, description, is_active)
        VALUES (@billing_date, @disable_date, @description, @is_active);
        SELECT SCOPE_IDENTITY() as id;
      `);

    const newId = result.recordset[0].id;
    const newScheduleResult = await pool.request()
      .input('id', sql.Int, newId)
      .query(`SELECT * FROM billing_schedule WHERE id = @id`);

    res.status(201).json({ status: 'success', data: newScheduleResult.recordset[0] });
  } catch (error) {
    logger.error('Error creating billing schedule: ' + error.message, { stack: error.stack });
    res.status(500).json({ status: 'error', message: 'Failed to create billing schedule', error: error.message });
  } finally {
    if (pool) pool.close();
  }
});

// อัปเดตกำหนดการ
router.put('/:id', async (req, res) => {
  let pool;
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid ID format' });
    }

    const { billing_date, disable_date, description, is_active } = req.body;

    pool = await getConnection();
    const existingResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT * FROM billing_schedule WHERE id = @id`);

    if (!existingResult.recordset.length) {
      return res.status(404).json({ status: 'error', message: 'Billing schedule not found' });
    }

    const existing = existingResult.recordset[0];

    // Validation สำหรับวันที่ (ถ้ามีการส่งมา)
    let billingDate = existing.billing_date;
    let disableDate = existing.disable_date;
    if (billing_date) {
      billingDate = new Date(billing_date);
      if (isNaN(billingDate.getTime())) {
        return res.status(400).json({ status: 'error', message: 'Invalid billing date format' });
      }
    }
    if (disable_date) {
      disableDate = new Date(disable_date);
      if (isNaN(disableDate.getTime())) {
        return res.status(400).json({ status: 'error', message: 'Invalid disable date format' });
      }
    }
    if (billingDate >= disableDate) {
      return res.status(400).json({ status: 'error', message: 'Billing date must be before disable date' });
    }

    await pool.request()
      .input('id', sql.Int, id)
      .input('billing_date', sql.DateTime2, billingDate)
      .input('disable_date', sql.DateTime2, disableDate)
      .input('description', sql.NVarChar, description !== undefined ? description : existing.description)
      .input('is_active', sql.Bit, is_active !== undefined ? is_active : existing.is_active)
      .query(`
        UPDATE billing_schedule
        SET 
          billing_date = @billing_date,
          disable_date = @disable_date,
          description = @description,
          is_active = @is_active,
          updated_at = GETUTCDATE()
        WHERE id = @id
      `);

    const updatedResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT * FROM billing_schedule WHERE id = @id`);
    res.json({ status: 'success', data: updatedResult.recordset[0] });
  } catch (error) {
    logger.error(`Error updating billing schedule ${req.params.id}: ${error.message}`, { stack: error.stack });
    res.status(500).json({ status: 'error', message: 'Failed to update billing schedule', error: error.message });
  } finally {
    if (pool) pool.close();
  }
});

// ลบกำหนดการ
router.delete('/:id', async (req, res) => {
  let pool;
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid ID format' });
    }

    pool = await getConnection();
    const existingResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT * FROM billing_schedule WHERE id = @id`);

    if (!existingResult.recordset.length) {
      return res.status(404).json({ status: 'error', message: 'Billing schedule not found' });
    }

    await pool.request()
      .input('id', sql.Int, id)
      .query(`DELETE FROM billing_schedule WHERE id = @id`);
    res.status(204).json({ status: 'success', message: 'Billing schedule deleted' });
  } catch (error) {
    logger.error(`Error deleting billing schedule ${req.params.id}: ${error.message}`, { stack: error.stack });
    res.status(500).json({ status: 'error', message: 'Failed to delete billing schedule', error: error.message });
  } finally {
    if (pool) pool.close();
  }
});

module.exports = router;
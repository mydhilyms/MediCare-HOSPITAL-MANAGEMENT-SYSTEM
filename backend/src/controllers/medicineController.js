const db = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

exports.getMedicines = async (req, res, next) => {
  try {
    const { search } = req.query;
    let where = '';
    const params = [];

    if (search) {
      where = 'WHERE lower(m.name) ILIKE $1';
      params.push(`%${search}%`);
    }

    const result = await db.query(
      `SELECT m.medicine_id,
              m.medicine_id AS id,
              m.name,
              m.name AS medicine_name,
              COALESCE(inv.stock_quantity, 0) AS stock_quantity,
              COALESCE(inv.stock_quantity, 0) AS "stockQuantity",
              COALESCE(inv.price, 0) AS unit_price,
              COALESCE(inv.price, 0) AS "unitPrice",
              COALESCE(inv.price, 0) AS price,
              'General' AS category,
              'active' AS status
       FROM medicine m
       LEFT JOIN (
         SELECT medicine_id, SUM(stock_quantity) AS stock_quantity, AVG(price) AS price
         FROM pharmacy_inventory
         GROUP BY medicine_id
       ) inv ON inv.medicine_id = m.medicine_id
       ${where}
       ORDER BY m.medicine_id DESC`,
      params
    );

    return sendSuccess(res, 200, { medicines: result.rows });
  } catch (error) {
    next(error);
  }
};

exports.getMedicineById = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT m.medicine_id,
              m.medicine_id AS id,
              m.name,
              m.name AS medicine_name,
              COALESCE(inv.stock_quantity, 0) AS stock_quantity,
              COALESCE(inv.stock_quantity, 0) AS "stockQuantity",
              COALESCE(inv.price, 0) AS unit_price,
              COALESCE(inv.price, 0) AS "unitPrice",
              COALESCE(inv.price, 0) AS price,
              'General' AS category,
              'active' AS status
       FROM medicine m
       LEFT JOIN (
         SELECT medicine_id, SUM(stock_quantity) AS stock_quantity, AVG(price) AS price
         FROM pharmacy_inventory
         GROUP BY medicine_id
       ) inv ON inv.medicine_id = m.medicine_id
       WHERE m.medicine_id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return sendError(res, 404, 'Medicine not found.');
    return sendSuccess(res, 200, { medicine: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const wholeNumber = (value, minimum=0) => /^\d+$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value)) && Number(value) >= minimum;
const validCurrency = value => /^(0|[1-9]\d*)(\.\d{1,2})?$/.test(String(value ?? '')) && Number.isFinite(Number(value));

// Stock and price are pharmacy-specific. Do not silently edit the first pharmacy.
exports.createMedicine = async (req, res, next) => {
  const { name, pharmacyId, stockQuantity, unitPrice, reorderLevel=10 } = req.body;
  if (!String(name||'').trim() || !wholeNumber(pharmacyId,1) || !wholeNumber(stockQuantity) || !validCurrency(unitPrice) || !wholeNumber(reorderLevel))
    return sendError(res,400,'Medicine name, pharmacy, whole-number stock, non-negative price (two decimals) and whole-number reorder threshold are required.');
  let client;
  try {
    client=await db.pool.connect(); await client.query('BEGIN');
    const pharmacy=await client.query('SELECT pharmacy_id FROM pharmacy WHERE pharmacy_id=$1',[pharmacyId]);
    if(!pharmacy.rows.length){ await client.query('ROLLBACK');return sendError(res,404,'Pharmacy not found.'); }
    const created=await client.query('INSERT INTO medicine (name) VALUES ($1) RETURNING *',[name.trim()]);
    const inventory=await client.query(`INSERT INTO pharmacy_inventory(pharmacy_id,medicine_id,stock_quantity,price,reorder_level)
      VALUES($1,$2,$3,$4,$5) RETURNING *`,[pharmacyId,created.rows[0].medicine_id,stockQuantity,unitPrice,reorderLevel]);
    await client.query('COMMIT');return sendSuccess(res,201,{medicine:{...created.rows[0],...inventory.rows[0]}});
  }catch(error){if(client)try{await client.query('ROLLBACK');}catch(_){}next(error);}finally{if(client)client.release();}
};

exports.updateMedicine = async (req, res, next) => {
  const {name,pharmacyId,stockQuantity,unitPrice,reorderLevel}=req.body;
  const editInventory=stockQuantity!==undefined||unitPrice!==undefined||reorderLevel!==undefined;
  if(name!==undefined && !String(name).trim())return sendError(res,400,'Medicine name cannot be empty.');
  if(editInventory && !wholeNumber(pharmacyId,1))return sendError(res,400,'Choose the pharmacy whose inventory must be changed.');
  if(stockQuantity!==undefined&&!wholeNumber(stockQuantity))return sendError(res,400,'Stock quantity must be a non-negative whole number.');
  if(reorderLevel!==undefined&&!wholeNumber(reorderLevel))return sendError(res,400,'Reorder threshold must be a non-negative whole number.');
  if(unitPrice!==undefined&&!validCurrency(unitPrice))return sendError(res,400,'Price must be non-negative, with at most two decimal places.');
  let client;
  try{
    client=await db.pool.connect();await client.query('BEGIN');
    const medicine=await client.query('SELECT * FROM medicine WHERE medicine_id=$1 FOR UPDATE',[req.params.id]);
    if(!medicine.rows.length){await client.query('ROLLBACK');return sendError(res,404,'Medicine not found.');}
    let updated=medicine.rows[0];
    if(name!==undefined){const result=await client.query('UPDATE medicine SET name=$1 WHERE medicine_id=$2 RETURNING *',[name.trim(),req.params.id]);updated=result.rows[0];}
    let inventory=null;
    if(editInventory){
      const result=await client.query(`INSERT INTO pharmacy_inventory(pharmacy_id,medicine_id,stock_quantity,price,reorder_level)
        VALUES ($1,$2,COALESCE($3,0),COALESCE($4,0),COALESCE($5,10))
        ON CONFLICT(pharmacy_id,medicine_id) DO UPDATE SET stock_quantity=COALESCE($3,pharmacy_inventory.stock_quantity),
        price=COALESCE($4,pharmacy_inventory.price),reorder_level=COALESCE($5,pharmacy_inventory.reorder_level) RETURNING *`,
        [pharmacyId,req.params.id,stockQuantity??null,unitPrice??null,reorderLevel??null]);
      inventory=result.rows[0];
    }
    await client.query('COMMIT');return sendSuccess(res,200,{medicine:{...updated,...(inventory||{})}});
  }catch(error){if(client)try{await client.query('ROLLBACK');}catch(_){}next(error);}finally{if(client)client.release();}
};

exports.deleteMedicine = async (req, res, next) => {
  try {
    await db.query('DELETE FROM pharmacy_inventory WHERE medicine_id = $1', [req.params.id]);
    const result = await db.query('DELETE FROM medicine WHERE medicine_id = $1 RETURNING medicine_id', [req.params.id]);
    if (!result.rows.length) return sendError(res, 404, 'Medicine not found.');
    return sendSuccess(res, 200, { message: 'Medicine deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

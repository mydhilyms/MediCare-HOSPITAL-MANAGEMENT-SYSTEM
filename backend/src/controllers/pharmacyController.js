const db = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

exports.getPharmacies = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT p.*,
              CONCAT('Pharmacy Branch ', p.branch_id) AS pharmacy_name,
              CONCAT('Pharmacy Branch ', p.branch_id) AS name,
              b.location,
              b.location AS address,
              b.location AS branch_location,
              'active' AS status
       FROM pharmacy p
       JOIN branch b ON b.branch_id = p.branch_id
       ORDER BY p.pharmacy_id DESC`
    );
    return sendSuccess(res, 200, { pharmacies: result.rows });
  } catch (error) {
    next(error);
  }
};

exports.getInventory = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT pi.*,
              pi.stock_quantity AS quantity,
              pi.price AS unit_price,
              m.name AS medicine_name,
              'General' AS category,
              CURRENT_DATE AS last_updated
       FROM pharmacy_inventory pi
       JOIN medicine m ON m.medicine_id = pi.medicine_id
       WHERE pi.pharmacy_id = $1
       ORDER BY m.name`,
      [req.params.id]
    );
    return sendSuccess(res, 200, { inventory: result.rows });
  } catch (error) {
    next(error);
  }
};

const whole = (v,min=0)=>/^\d+$/.test(String(v??'')) && Number.isSafeInteger(Number(v)) && Number(v)>=min;
const priceOk=v=>/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(String(v??'')) && Number.isFinite(Number(v));

exports.addInventory = async (req, res, next) => {
  try {
    const { medicineId, stockQuantity, price, reorderLevel } = req.body;
    if(!whole(medicineId,1)||!whole(stockQuantity)||!whole(reorderLevel??0)||!priceOk(price))return sendError(res,400,'Medicine ID and stock/reorder quantities must be whole numbers and price must have at most two decimal places.');
    if (!medicineId || stockQuantity === undefined || price === undefined) {
      return sendError(res, 400, 'Medicine, stock quantity and price are required.');
    }

    const pharmacy = await db.query('SELECT pharmacy_id FROM pharmacy WHERE pharmacy_id = $1', [req.params.id]);
    if (!pharmacy.rows.length) {
      return sendError(res, 404, 'Pharmacy not found.');
    }

    const result = await db.query(
      `INSERT INTO pharmacy_inventory (pharmacy_id, medicine_id, stock_quantity, price, reorder_level)
       VALUES ($1, $2, $3, $4, COALESCE($5, 0))
       ON CONFLICT (pharmacy_id, medicine_id)
       DO UPDATE SET stock_quantity = pharmacy_inventory.stock_quantity + EXCLUDED.stock_quantity,
                    price = EXCLUDED.price,
                    reorder_level = COALESCE(EXCLUDED.reorder_level, pharmacy_inventory.reorder_level)
       RETURNING *`,
      [req.params.id, medicineId, Number(stockQuantity), Number(price), Number(reorderLevel || 0)]
    );

    return sendSuccess(res, 201, { inventory: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.updateInventory = async (req, res, next) => {
  try {
    const { stockQuantity, price, reorderLevel, action } = req.body;
    const qtyCheck=req.body.quantity!==undefined?req.body.quantity:stockQuantity;
    if(qtyCheck!==undefined&&!whole(qtyCheck,action==='dispense'||action==='deduct'?1:0))return sendError(res,400,'Stock quantity must be a non-negative whole number.');
    if(reorderLevel!==undefined&&!whole(reorderLevel))return sendError(res,400,'Reorder threshold must be a whole number.');
    if(price!==undefined&&!priceOk(price))return sendError(res,400,'Price must have at most two decimal places.');

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const qty = req.body.quantity !== undefined ? req.body.quantity : stockQuantity;

      if (action === 'dispense' || action === 'deduct') {
        if (qty === undefined || Number(qty) <= 0) {
          await client.query('ROLLBACK');
          return sendError(res, 400, 'Dispensed quantity must be greater than zero.');
        }

        try {
          // Use the schema's built-in dispense_medicine function
          const dispensed = await client.query(
            'SELECT dispense_medicine($1, $2, $3) AS remaining_stock',
            [req.params.id, req.params.medicineId, Number(qty)]
          );
          await client.query('COMMIT');
          return sendSuccess(res, 200, { remainingStock: dispensed.rows[0].remaining_stock });
        } catch (funcErr) {
          await client.query('ROLLBACK');
          return sendError(res, 409, funcErr.message, 'insufficient_inventory');
        }
      }

      // Normal update
      const targetStock = stockQuantity !== undefined ? stockQuantity : req.body.quantity;
      if (targetStock !== undefined && Number(targetStock) < 0) {
        await client.query('ROLLBACK');
        return sendError(res, 400, 'Stock quantity cannot be negative.');
      }

      const current = await client.query(
        `SELECT * FROM pharmacy_inventory WHERE pharmacy_id = $1 AND medicine_id = $2 FOR UPDATE`,
        [req.params.id, req.params.medicineId]
      );

      if (!current.rows.length) {
        await client.query('ROLLBACK');
        return sendError(res, 404, 'Inventory entry not found.');
      }

      const result = await client.query(
        `UPDATE pharmacy_inventory
         SET stock_quantity = COALESCE($1, stock_quantity),
             price = COALESCE($2, price),
             reorder_level = COALESCE($3, reorder_level)
         WHERE pharmacy_id = $4 AND medicine_id = $5
         RETURNING *`,
        [
          targetStock !== undefined ? Number(targetStock) : null,
          price !== undefined ? Number(price) : null,
          reorderLevel !== undefined ? Number(reorderLevel) : null,
          req.params.id,
          req.params.medicineId,
        ]
      );

      await client.query('COMMIT');
      return sendSuccess(res, 200, { inventory: result.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
};

import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();
const BRAND_ID = '00000000-0000-0000-0000-000000000001';

router.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id,
              company_name AS "companyName",
              short_name AS "shortName",
              logo_data AS "logoData",
              sidebar_logo_data AS "sidebarLogoData",
              favicon_data AS "faviconData",
              login_logo_data AS "loginLogoData",
              show_sidebar_text AS "showSidebarText",
              updated_at AS "updatedAt"
         FROM branding
        WHERE id = $1
        LIMIT 1`,
      [BRAND_ID],
    );
    if (result.rows.length === 0) {
      return res.json({
        id: BRAND_ID,
        companyName: 'Atlas',
        shortName: 'Atlas',
        logoData: null,
        sidebarLogoData: null,
        faviconData: null,
        loginLogoData: null,
        showSidebarText: true,
        updatedAt: new Date().toISOString(),
      });
    }
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const {
      companyName,
      shortName,
      logoData,
      sidebarLogoData,
      faviconData,
      loginLogoData,
      showSidebarText,
    } = req.body ?? {};
    if (!companyName || !shortName) {
      res.status(400).json({ error: 'companyName and shortName are required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO branding (id, company_name, short_name, logo_data, sidebar_logo_data, favicon_data, login_logo_data, show_sidebar_text, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, TRUE), NOW())
       ON CONFLICT (id) DO UPDATE
         SET company_name = EXCLUDED.company_name,
             short_name = EXCLUDED.short_name,
             logo_data = EXCLUDED.logo_data,
             sidebar_logo_data = EXCLUDED.sidebar_logo_data,
             favicon_data = EXCLUDED.favicon_data,
             login_logo_data = EXCLUDED.login_logo_data,
             show_sidebar_text = EXCLUDED.show_sidebar_text,
             updated_at = NOW()
       RETURNING id,
                 company_name AS "companyName",
                 short_name AS "shortName",
                 logo_data AS "logoData",
                 sidebar_logo_data AS "sidebarLogoData",
                 favicon_data AS "faviconData",
                 login_logo_data AS "loginLogoData",
                 show_sidebar_text AS "showSidebarText",
                 updated_at AS "updatedAt"`,
      [
        BRAND_ID,
        companyName,
        shortName,
        logoData ?? null,
        sidebarLogoData ?? null,
        faviconData ?? null,
        loginLogoData ?? null,
        typeof showSidebarText === 'boolean' ? showSidebarText : true,
      ],
    );

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

export default router;

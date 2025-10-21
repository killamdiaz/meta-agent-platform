import { pool } from '../db.js';

export interface HealthStatus {
  database: boolean;
  error?: string;
}

export async function apiHealthCheck(): Promise<HealthStatus> {
  try {
    await pool.query('SELECT 1');
    return { database: true };
  } catch (error) {
    return {
      database: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

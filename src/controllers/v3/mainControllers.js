import { getStats } from '../../models/v3/mainModels.js';

export async function getActualStats(req, res) {
  try {
    res.json(await getStats());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

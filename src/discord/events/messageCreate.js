import { sendMessageToGmod } from '../../controllers/v3/guildsControllers.js';

export default {
  name: 'messageCreate',
  async execute(message) {
    await sendMessageToGmod(message);
  },
};

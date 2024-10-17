export default {
  origin: function (origin: string, callback: any) {
    if (!origin || origin.includes('gmod-integration.com')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
};

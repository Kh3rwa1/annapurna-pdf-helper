import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin: frontendOrigin,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false
  })
);
app.use(express.json({ limit: '4kb' }));

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.post('/create-order', (_request, response) => {
  // TODO: implement when adding UPI/Razorpay.
  response.status(501).json({ error: 'Not implemented' });
});

app.post('/verify', (_request, response) => {
  // TODO: implement when adding UPI/Razorpay.
  response.status(501).json({ error: 'Not implemented' });
});

app.post('/webhook', (_request, response) => {
  // TODO: implement when adding UPI/Razorpay.
  response.status(501).json({ error: 'Not implemented' });
});

app.use((_request, response) => {
  response.status(404).json({ error: 'Not found' });
});

export default app;

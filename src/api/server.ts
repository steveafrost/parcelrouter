import express from 'express';
import path from 'path';
import { getDb, initDb } from '../db/connection';
import { PackageRepository } from '../db/repositories/package-repository';

export function createServer(): express.Express {
  const app = express();
  
  app.use(express.json());
  
  // Serve static files from public directory
  // In Docker: /app/dist -> /app/public
  // Locally: src/api -> public
  const publicPath = process.env.NODE_ENV === 'production' 
    ? path.join(__dirname, '../public')
    : path.join(__dirname, '../../public');
  app.use(express.static(publicPath));

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // List all tracked packages
  app.get('/packages', (req, res) => {
    try {
      const db = getDb();
      const repo = new PackageRepository(db);
      const packages = repo.findAll();
      res.json(packages);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch packages' });
    }
  });

  // Get single package
  app.get('/packages/:id', (req, res) => {
    try {
      const db = getDb();
      const repo = new PackageRepository(db);
      const pkg = repo.findById(req.params.id);
      
      if (!pkg) {
        return res.status(404).json({ error: 'Package not found' });
      }
      
      res.json(pkg);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch package' });
    }
  });

  // Serve dashboard for root route
  const indexPath = process.env.NODE_ENV === 'production'
    ? path.join(__dirname, '../public/index.html')
    : path.join(__dirname, '../../public/index.html');
  app.get('/', (req, res) => {
    res.sendFile(indexPath);
  });

  return app;
}

export function startServer(port: number = 3000): void {
  // Initialize database
  initDb();
  
  const app = createServer();
  
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

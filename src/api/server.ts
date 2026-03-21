import express from 'express';
import path from 'path';
import fs from 'fs';
import { getDb, initDb } from '../db/connection';
import { PackageRepository } from '../db/repositories/package-repository';

export function createServer(): express.Express {
  const app = express();
  
  app.use(express.json());
  
  // Determine public path based on environment
  const publicPath = process.env.NODE_ENV === 'production' 
    ? path.join(__dirname, '../public')
    : path.join(__dirname, '../../public');
  
  console.log('Public path:', publicPath);
  console.log('Public folder exists:', fs.existsSync(publicPath));
  if (fs.existsSync(publicPath)) {
    console.log('Public folder contents:', fs.readdirSync(publicPath));
  }
  
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
  
  // Serve dashboard for root route - MUST be before static middleware
  app.get('/', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    console.log('Serving index from:', indexPath);
    console.log('Index exists:', fs.existsSync(indexPath));
    
    if (!fs.existsSync(indexPath)) {
      return res.status(404).json({ 
        error: 'Dashboard not found',
        path: indexPath,
        __dirname: __dirname
      });
    }
    
    res.sendFile(indexPath);
  });
  
  // Serve static files from public directory
  app.use(express.static(publicPath));

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

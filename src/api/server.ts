import express from 'express';
import path from 'path';
import fs from 'fs';
import type { Server } from 'http';
import { getDb, initDb } from '../db/connection';
import { PackageRepository } from '../db/repositories/package-repository';
import { ReviewRepository } from '../db/repositories/review-repository';
import { StatsRepository } from '../db/repositories/stats-repository';
import { ParcelSyncRepository } from '../db/repositories/parcel-sync-repository';
import { createWebhookDispatcherFromEnv } from '../webhooks/dispatcher';
import { ParcelSyncService } from '../services/parcel-sync-service';
import {
  clearSessionCookie,
  createSessionToken,
  credentialsAreValid,
  loginTokenIsValid,
  setSessionCookie,
} from './auth';

export function createServer(): express.Express {
  const app = express();
  const webhookDispatcher = createWebhookDispatcherFromEnv();
  
  app.use(express.json());
  
  // Determine public path - try multiple locations
  const possiblePublicPaths = [
    path.join(__dirname, '../../public'),      // Local dev
    path.join(__dirname, '../public'),         // Docker alternative
    path.join(process.cwd(), 'public'),        // Docker: /app/public
  ];
  
  let publicPath = possiblePublicPaths[0];
  for (const p of possiblePublicPaths) {
    if (fs.existsSync(p)) {
      publicPath = p;
      break;
    }
  }
  
  console.log('Public path:', publicPath);
  console.log('Public folder exists:', fs.existsSync(publicPath));
  if (fs.existsSync(publicPath)) {
    console.log('Public folder contents:', fs.readdirSync(publicPath));
  }
  
  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      parcelSyncEnabled: Boolean(process.env.PARCEL_API_KEY),
      pendingParcelSyncs: new ParcelSyncRepository(getDb()).countPending(),
      failedParcelSyncs: new ParcelSyncRepository(getDb()).countFailed(),
      webhookEnabled: webhookDispatcher.enabled,
    });
  });

  app.get('/login', (req, res) => {
    if (process.env.PARCEL_TRACKER_AUTH_TOKEN && credentialsAreValid(req, process.env.PARCEL_TRACKER_AUTH_TOKEN)) {
      return res.redirect('/');
    }
    return res.sendFile(path.join(publicPath, 'login.html'));
  });

  app.post('/auth/login', (req, res) => {
    const expected = process.env.PARCEL_TRACKER_AUTH_TOKEN;
    if (!expected) {
      return res.status(503).json({ error: 'PARCEL_TRACKER_AUTH_TOKEN is not configured.' });
    }

    if (!loginTokenIsValid(req.body?.token, expected)) {
      return res.status(401).json({ error: 'Invalid access token' });
    }

    setSessionCookie(req, res, createSessionToken(expected));
    return res.json({ success: true });
  });

  app.post('/auth/logout', (req, res) => {
    clearSessionCookie(req, res);
    return res.json({ success: true });
  });

  app.get('/auth/status', (req, res) => {
    const expected = process.env.PARCEL_TRACKER_AUTH_TOKEN;
    return res.json({ authenticated: Boolean(expected && credentialsAreValid(req, expected)) });
  });

  app.use(requireDashboardAuth);
  
  // Get stats
  app.get('/stats', (req, res) => {
    try {
      const db = getDb();
      const repo = new StatsRepository(db);
      const stats = repo.getStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
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

  // List pending review items
  app.get('/review', (req, res) => {
    try {
      const db = getDb();
      const repo = new ReviewRepository(db);
      res.json(repo.findPending());
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch review queue' });
    }
  });

  // Approve review item and create package
  app.post('/review/:id/approve', async (req, res) => {
    try {
      const db = getDb();
      const reviewRepo = new ReviewRepository(db);
      const packageRepo = new PackageRepository(db);
      const item = reviewRepo.findById(req.params.id);

      if (!item || item.status !== 'pending') {
        return res.status(404).json({ error: 'Review item not found' });
      }

      if (packageRepo.exists(item.trackingNumber)) {
        reviewRepo.updateStatus(item.id, 'approved');
        const existingPackage = packageRepo.findByTrackingNumber(item.trackingNumber);
        await webhookDispatcher.dispatch('review.approved', {
          reviewItem: item,
          package: existingPackage,
          alreadyExisted: true,
        });
        return res.json({
          success: true,
          message: 'Review item approved; package already existed',
          package: existingPackage,
        });
      }

      const pkg = db.transaction(() => {
        const created = packageRepo.create({
          trackingNumber: item.trackingNumber,
          carrier: item.carrier,
          retailer: item.retailer,
          productName: item.productName,
          orderNumber: item.orderNumber,
          emailMessageId: item.emailMessageId,
          confidence: item.confidence,
        });
        reviewRepo.updateStatus(item.id, 'approved');
        new StatsRepository(db).incrementPackagesCreated();
        return created;
      })();
      await webhookDispatcher.dispatch('review.approved', {
        reviewItem: item,
        package: pkg,
        alreadyExisted: false,
      });
      await webhookDispatcher.dispatch('package.created', {
        package: pkg,
        source: {
          reviewItemId: item.id,
        },
      });

      const syncResult = await new ParcelSyncService(db, process.env.PARCEL_API_KEY).syncPackage(pkg);
      if (syncResult.status === 'synced') {
        await webhookDispatcher.dispatch('parcel.synced', { package: syncResult.package });
      } else if (syncResult.status === 'queued') {
        await webhookDispatcher.dispatch('parcel.sync_failed', {
          package: pkg,
          error: syncResult.error,
          retryQueued: true,
        });
      }
      res.json({
        success: true,
        message: 'Review item approved',
        package: syncResult.status === 'synced' ? syncResult.package : pkg,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to approve review item' });
    }
  });

  // Ignore review item
  app.post('/review/:id/ignore', async (req, res) => {
    try {
      const db = getDb();
      const repo = new ReviewRepository(db);
      const item = repo.findById(req.params.id);

      if (!item || item.status !== 'pending') {
        return res.status(404).json({ error: 'Review item not found' });
      }

      repo.updateStatus(item.id, 'ignored');
      await webhookDispatcher.dispatch('review.ignored', {
        reviewItem: item,
      });
      res.json({ success: true, message: 'Review item ignored' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to ignore review item' });
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

  // Delete package
  app.delete('/packages/:id', async (req, res) => {
    try {
      const db = getDb();
      const repo = new PackageRepository(db);
      
      // Check if package exists
      const pkg = repo.findById(req.params.id);
      if (!pkg) {
        return res.status(404).json({ error: 'Package not found' });
      }
      
      // Delete from database
      const deleted = repo.delete(req.params.id);
      
      if (deleted) {
        await webhookDispatcher.dispatch('package.deleted', {
          package: pkg,
        });
        res.json({ 
          success: true, 
          message: 'Package removed from tracker',
          note: 'If this package was synced to another app, remove it there too if needed'
        });
      } else {
        res.status(500).json({ error: 'Failed to delete package' });
      }
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete package' });
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
  
  // Serve static files from public directory (disable index to let our route handle /)
  app.use(express.static(publicPath, { index: false }));

  // Debug: log all registered routes. Express 5 removed the deprecated
  // app._router; use app.router instead (same Router with .stack).
  console.log('Registered routes:');
  app.router.stack.forEach((r: any) => {
    if (r.route && r.route.path) {
      console.log(`  ${Object.keys(r.route.methods).join(',').toUpperCase()} ${r.route.path}`);
    }
  });

  // Catch-all for debugging
  app.use((req, res) => {
    console.log(`Unmatched request: ${req.method} ${req.path}`);
    res.status(404).json({ 
      error: 'Not found',
      path: req.path,
      method: req.method,
      availableRoutes: ['/health', '/stats', '/packages', '/review', '/']
    });
  });

  return app;
}

function requireDashboardAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const expected = process.env.PARCEL_TRACKER_AUTH_TOKEN;
  if (!expected) {
    res.status(503).json({ error: 'PARCEL_TRACKER_AUTH_TOKEN is required before exposing the dashboard API.' });
    return;
  }

  if (!credentialsAreValid(req, expected)) {
    if (req.method === 'GET' && req.path === '/') {
      res.redirect('/login');
      return;
    }
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

export function startServer(port: number = 3000): Server {
  // Initialize database
  initDb();
  
  const app = createServer();
  
  return app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

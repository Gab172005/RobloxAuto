import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('roforgeDesktop', {
  isDesktop: true,
  platform: process.platform,
});


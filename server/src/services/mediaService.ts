import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { StudioDatabase } from '../db/database.js';
import type { ReviewItemRecord } from '../types.js';

const execFileAsync = promisify(execFile);

export interface MediaAssetEntry {
  folder: 'art' | 'media';
  filename: string;
  relPath: string;
  url: string;
  kind: 'image' | 'video' | 'document';
  sizeBytes: number;
  modifiedAt: string;
}

export interface PromoAssembleInput {
  projectId: string;
  inputClipFilename?: string; // file inside workspace/<slug>/media/
  hookCaption: string;
  ctaCaption?: string;
  outputName?: string;
  durationSeconds?: number;
  addToReviewQueue?: boolean;
}

export interface PromoAssembleResult {
  mode: 'ffmpeg_rendered' | 'storyboard_fallback';
  ffmpegInstalled: boolean;
  outputRelPath: string;
  outputUrl?: string;
  ffmpegCommand: string;
  message: string;
  reviewItem?: ReviewItemRecord;
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/\r?\n/g, ' ');
}

export class MediaService {
  constructor(private db: StudioDatabase) {}

  public async checkFfmpeg(): Promise<boolean> {
    try {
      await execFileAsync('ffmpeg', ['-version'], { windowsHide: true, timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  public listProjectMedia(projectId: string, workspacePath: string): MediaAssetEntry[] {
    const results: MediaAssetEntry[] = [];
    for (const folder of ['art', 'media'] as const) {
      const dir = path.join(workspacePath, folder);
      if (!fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const full = path.join(dir, entry.name);
        const stat = fs.statSync(full);
        const lower = entry.name.toLowerCase();
        const kind: MediaAssetEntry['kind'] = /\.(png|jpg|jpeg|webp|gif)$/.test(lower)
          ? 'image'
          : /\.(mp4|webm|mov)$/.test(lower)
            ? 'video'
            : 'document';
        results.push({
          folder,
          filename: entry.name,
          relPath: `${folder}/${entry.name}`,
          url: `/api/projects/${projectId}/media/${folder}/${encodeURIComponent(entry.name)}`,
          kind,
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      }
    }
    return results.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }

  public resolveSafeMediaPath(workspacePath: string, folder: string, filename: string): string {
    if (folder !== 'art' && folder !== 'media') {
      throw new Error('Invalid media folder');
    }
    const safeFile = path.basename(filename);
    const full = path.resolve(workspacePath, folder, safeFile);
    const baseDir = path.resolve(workspacePath, folder);
    if (!full.startsWith(baseDir)) {
      throw new Error('Path traversal blocked');
    }
    return full;
  }

  public saveBase64Asset(
    workspacePath: string,
    folder: 'art' | 'media',
    filename: string,
    base64Data: string
  ): { relPath: string; sizeBytes: number } {
    const safeFile = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const dir = path.join(workspacePath, folder);
    fs.mkdirSync(dir, { recursive: true });
    const full = path.join(dir, safeFile);
    const cleaned = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const buffer = Buffer.from(cleaned, 'base64');
    fs.writeFileSync(full, buffer);
    return { relPath: `${folder}/${safeFile}`, sizeBytes: buffer.length };
  }

  /**
   * Assembles a 1080x1920 (9:16) TikTok/Reels/Shorts captioned MP4 from a gameplay clip using ffmpeg.
   * Gracefully falls back to generating an editable storyboard + exact ffmpeg recipe when ffmpeg or clip is absent.
   */
  public async assemblePromoVideo(input: PromoAssembleInput): Promise<PromoAssembleResult> {
    const project = this.db.getProject(input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);

    const ffmpegInstalled = await this.checkFfmpeg();
    const mediaDir = path.join(project.workspacePath, 'media');
    const artDir = path.join(project.workspacePath, 'art');
    fs.mkdirSync(mediaDir, { recursive: true });
    fs.mkdirSync(artDir, { recursive: true });

    const safeOutStem = (input.outputName || `promo_9x16_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const outMp4Name = `${safeOutStem}.mp4`;
    const outMp4Abs = path.join(mediaDir, outMp4Name);
    const duration = Math.max(5, Math.min(60, input.durationSeconds || 15));

    const hookText = escapeDrawtext(input.hookCaption.slice(0, 72));
    const ctaText = escapeDrawtext((input.ctaCaption || `PLAY ${project.name.toUpperCase()} ON ROBLOX!`).slice(0, 72));

    // Crop/scale any 16:9 gameplay clip cleanly into 1080x1920 (9:16) with hook + CTA caption boxes
    const vfFilter = [
      'scale=1080:1920:force_original_aspect_ratio=increase',
      'crop=1080:1920',
      `drawtext=text='${hookText}':fontcolor=white:fontsize=56:box=1:boxcolor=black@0.65:boxborderw=18:x=(w-text_w)/2:y=210:enable='between(t,0,4.5)'`,
      `drawtext=text='${ctaText}':fontcolor=yellow:fontsize=48:box=1:boxcolor=black@0.75:boxborderw=16:x=(w-text_w)/2:y=h-320:enable='gte(t,${Math.max(
        3,
        duration - 4
      )})'`,
    ].join(',');

    const clipAbs = input.inputClipFilename
      ? this.resolveSafeMediaPath(project.workspacePath, 'media', input.inputClipFilename)
      : null;
    const hasClip = Boolean(clipAbs && fs.existsSync(clipAbs));

    const ffmpegArgs = hasClip && clipAbs
      ? [
          '-y',
          '-i',
          clipAbs,
          '-t',
          String(duration),
          '-vf',
          vfFilter,
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-crf',
          '22',
          '-c:a',
          'aac',
          '-movflags',
          '+faststart',
          outMp4Abs,
        ]
      : [
          '-y',
          '-f',
          'lavfi',
          '-i',
          `color=c=#111827:s=1080x1920:d=${duration}:r=30`,
          '-vf',
          vfFilter,
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          '+faststart',
          outMp4Abs,
        ];

    const commandPreview = `ffmpeg ${ffmpegArgs.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`;

    if (ffmpegInstalled) {
      await execFileAsync('ffmpeg', ffmpegArgs, {
        cwd: project.workspacePath,
        windowsHide: true,
        timeout: 120_000,
      });

      const relPath = `media/${outMp4Name}`;
      const outputUrl = `/api/projects/${project.id}/media/media/${encodeURIComponent(outMp4Name)}`;
      let reviewItem: ReviewItemRecord | undefined;

      if (input.addToReviewQueue !== false) {
        reviewItem = this.db.createReview({
          projectId: project.id,
          agentId: 'Splash',
          category: 'promo',
          title: `[Splash] 9:16 TikTok/Shorts Promo — ${outMp4Name}`,
          summary: `Assembled 1080x1920 promo (${duration}s)\nHook: "${input.hookCaption}"\nCTA: "${input.ctaCaption || project.name}"`,
          attachments: [
            {
              type: 'video',
              label: outMp4Name,
              path: relPath,
              url: outputUrl,
            },
          ],
        });
      }

      return {
        mode: 'ffmpeg_rendered',
        ffmpegInstalled: true,
        outputRelPath: relPath,
        outputUrl,
        ffmpegCommand: commandPreview,
        message: `Rendered 9:16 MP4 promo to ${relPath}.`,
        reviewItem,
      };
    }

    // Graceful fallback when ffmpeg is not installed locally
    const storyboardFile = `${safeOutStem}_storyboard.json`;
    const storyboardAbs = path.join(artDir, storyboardFile);
    const storyboard = {
      project: project.name,
      format: '1080x1920 (9:16 TikTok / Reels / YouTube Shorts)',
      durationSeconds: duration,
      sourceClip: input.inputClipFilename || '(Record a 15s Studio clip into workspace media/ folder)',
      beats: [
        { startSec: 0, endSec: 4.5, caption: input.hookCaption, visualNote: 'High-contrast pattern interrupt / rare pull / chaos moment' },
        { startSec: 4.5, endSec: Math.max(5, duration - 4), caption: 'Watch the upgrade scale live!', visualNote: 'Fast cuts of VFX bursts, floating numbers, and progression spike' },
        { startSec: Math.max(5, duration - 4), endSec: duration, caption: input.ctaCaption || `PLAY ${project.name.toUpperCase()} ON ROBLOX!`, visualNote: 'Clear game title & Roblox search CTA' },
      ],
      ffmpegInstallHint: 'Install ffmpeg via `winget install Gyan.FFmpeg` or `scoop install ffmpeg` to enable 1-click MP4 rendering.',
      ffmpegCommand: commandPreview,
    };
    fs.writeFileSync(storyboardAbs, JSON.stringify(storyboard, null, 2) + '\n', 'utf8');

    const relPath = `art/${storyboardFile}`;
    let reviewItem: ReviewItemRecord | undefined;
    if (input.addToReviewQueue !== false) {
      reviewItem = this.db.createReview({
        projectId: project.id,
        agentId: 'Splash',
        category: 'promo',
        title: `[Splash] 9:16 Promo Storyboard (ffmpeg offline) — ${storyboardFile}`,
        summary: `ffmpeg is not installed on this machine, so RoForge generated a ready-to-render 9:16 storyboard & ffmpeg recipe.\nHook: "${input.hookCaption}"`,
        attachments: [
          {
            type: 'json',
            label: storyboardFile,
            path: relPath,
            content: JSON.stringify(storyboard, null, 2),
          },
        ],
      });
    }

    return {
      mode: 'storyboard_fallback',
      ffmpegInstalled: false,
      outputRelPath: relPath,
      ffmpegCommand: commandPreview,
      message: 'ffmpeg not detected locally — generated ready-to-render 9:16 storyboard & edit script in art/.',
      reviewItem,
    };
  }
}


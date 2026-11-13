import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { StageComposition } from './composition/StageComposition';
import { VIDEO, type AssetSlot } from './composition/types';
import { useProject } from './hooks/useProject';
import { useExport } from './hooks/useExport';
import { imageCrop, projectTextFit } from './composition/direction';
import './styles.css';

type IconName =
  | 'play'
  | 'pause'
  | 'restart'
  | 'previous'
  | 'next'
  | 'fullscreen'
  | 'upload'
  | 'download'
  | 'close'
  | 'focus'
  | 'chevron';
function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    play: <path d="m6 3 9 5-9 5V3Z" />,
    pause: <path d="M6 3v10M11 3v10" />,
    restart: <path d="M3 6a5.5 5.5 0 1 1-.1 4M3 2v4h4" />,
    previous: <path d="M4 3v10m9-10-7 5 7 5V3Z" />,
    next: <path d="M12 3v10M3 3l7 5-7 5V3Z" />,
    fullscreen: <path d="M6 2H2v4m8-4h4v4M2 10v4h4m8-4v4h-4" />,
    upload: <path d="M8 11V2m-3 3 3-3 3 3M2 10v4h12v-4" />,
    download: <path d="M8 2v9m-3-3 3 3 3-3M2 11v3h12v-3" />,
    close: <path d="m4 4 8 8m0-8-8 8" />,
    focus: (
      <>
        <path d="M5 2H2v3m9-3h3v3M2 11v3h3m9-3v3h-3" />
        <circle cx="8" cy="8" r="2.5" />
      </>
    ),
    chevron: <path d="m6 4 4 4-4 4" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
const shots = [
  {
    name: 'Reveal',
    description: 'Make an entrance',
    start: 0,
    end: 4,
    frame: 60,
  },
  {
    name: 'Detail',
    description: 'A closer look',
    start: 4,
    end: 8,
    frame: 180,
  },
  {
    name: 'Showcase',
    description: 'The final picture',
    start: 8,
    end: 12,
    frame: 315,
  },
];
const accents = ['#c3e0a1', '#b8d8c4', '#a9c7e8', '#d6b8e4', '#e6be9b'];
const slotNames: Record<AssetSlot, string> = {
  main: 'Main',
  detail: 'Detail',
  extra: 'Extra',
};

export default function App() {
  const player = useRef<PlayerRef>(null),
    stage = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    fileSlot = useRef<AssetSlot>('main'),
    projectInput = useRef<HTMLInputElement>(null);
  const {
    project,
    ready,
    saveStatus,
    error,
    update,
    replaceAsset,
    clearAsset,
    dismissError,
    captureForExport,
    exportPackage,
    importPackage,
  } = useProject();
  const exporter = useExport();
  const [frame, setFrame] = useState(60),
    [playing, setPlaying] = useState(false),
    [focusOpen, setFocusOpen] = useState(false);
  const [uploading, setUploading] = useState<AssetSlot | null>(null),
    [packageError, setPackageError] = useState('');
  const textIssues = projectTextFit(project);
  const issue = (field: string) =>
    textIssues.find((item) => item.field === field)?.message;
  const currentProject = useRef(project);
  currentProject.current = project;
  const exportState = exporter.status,
    downloadUrl = exporter.download?.url;
  const rendering = ['preparing', 'checking', 'rendering'].includes(
      exportState,
    ),
    activeShot = Math.min(2, Math.floor(frame / 120));
  const exportStatus =
    exportState === 'preparing'
      ? 'Preparing screenshots…'
      : exportState === 'checking'
        ? 'Checking browser…'
        : exportState === 'rendering'
          ? `Rendering ${Math.round(exporter.progress * 100)}%`
          : exportState === 'ready'
            ? 'Your video is ready.'
            : exportState === 'cancelled'
              ? 'Export canceled. Your project is ready to edit.'
              : exportState === 'error'
                ? (exporter.error ?? 'Export failed. Please try again.')
                : '';
  const startExport = () => {
    if (textIssues.length) return Promise.resolve();
    player.current?.pause();
    const snapshot = captureForExport();
    return exporter.start(snapshot.project, snapshot.assets);
  };
  const seek = useCallback((next: number) => {
    const safe = Math.max(0, Math.min(359, next));
    player.current?.seekTo(safe);
    setFrame(safe);
  }, []);
  useEffect(() => {
    const instance = player.current;
    if (!instance) return;
    instance.seekTo(60);
    const frames = ({ detail }: { detail: { frame: number } }) =>
        setFrame(detail.frame),
      play = () => setPlaying(true),
      pause = () => setPlaying(false);
    instance.addEventListener('frameupdate', frames);
    instance.addEventListener('play', play);
    instance.addEventListener('pause', pause);
    instance.addEventListener('ended', pause);
    return () => {
      instance.removeEventListener('frameupdate', frames);
      instance.removeEventListener('play', play);
      instance.removeEventListener('pause', pause);
      instance.removeEventListener('ended', pause);
    };
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        (event.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable="true"],dialog',
        )
      )
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        player.current?.toggle();
      }
      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
        event.preventDefault();
        player.current?.pause();
        seek(
          (player.current?.getCurrentFrame() ?? 0) +
            (event.code === 'ArrowLeft' ? -1 : 1),
        );
      }
      if (event.code === 'Home') {
        event.preventDefault();
        seek(0);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [seek]);
  async function render(short = false) {
    const { renderBrowserVideo } = await import('./export/browser');
    return renderBrowserVideo(currentProject.current, {
      frameRange: short ? [0, 29] : undefined,
    });
  }
  async function downloadProject() {
    try {
      const blob = await exportPackage(),
        url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'pocket-stage'}.pocket-stage.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setPackageError('');
    } catch (cause) {
      setPackageError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  useEffect(() => {
    Object.assign(window, {
      __proof: {
        capability: async () => {
          const { canRenderMediaOnWeb, renderSettings } = await import(
            './export/browser'
          );
          return canRenderMediaOnWeb({
            ...renderSettings,
            width: VIDEO.width,
            height: VIDEO.height,
          });
        },
        render,
        seek,
        project,
      },
      __studio: {
        getProject: () => currentProject.current,
        update,
        seek,
        play: () => player.current?.play(),
        pause: () => player.current?.pause(),
        startExport,
        cancelExport: exporter.cancel,
        getExportState: () => ({
          status: exporter.status,
          progress: exporter.progress,
          error: exporter.error,
          download: exporter.download
            ? {
                filename: exporter.download.filename,
                size: exporter.download.blob.size,
              }
            : null,
        }),
      },
    });
  });
  function selectFile(slot: AssetSlot) {
    fileSlot.current = slot;
    fileInput.current?.click();
  }
  const detailAsset = project.assets.detail ?? project.assets.main;
  const crop = imageCrop(detailAsset, 1080, 760, 1.52, project.focalPoint);
  const sample =
    project.assets.main.name === 'Fieldwork — generated UI fixture';
  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="./" aria-label="Pocket Stage home">
          <svg
            width="25"
            height="25"
            viewBox="0 0 25 25"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 7.5 12.5 3 21 7.5v10L12.5 22 4 17.5v-10Z"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <path
              d="m4 7.5 8.5 4.5L21 7.5M12.5 12v10"
              stroke="currentColor"
              strokeWidth="1.4"
            />
          </svg>
          <span>Pocket Stage</span>
        </a>
        <div className="project-title">
          <span className="project-divider" />
          <span>{project.name || 'Untitled project'}</span>
          {sample && <span className="sample-label">Sample project</span>}
        </div>
        <div className="top-actions">
          <span
            className={`save-state ${saveStatus === 'error' ? 'save-error' : ''}`}
          >
            {saveStatus === 'saved'
              ? 'Saved on this device'
              : saveStatus === 'saving'
                ? 'Saving…'
                : saveStatus === 'error'
                  ? 'Could not save'
                  : 'Opening project…'}
          </span>
          {rendering ? (
            <button className="button secondary" onClick={exporter.cancel}>
              Cancel export
            </button>
          ) : downloadUrl ? (
            <>
              <a
                className="button secondary download-button"
                href={downloadUrl}
                download={exporter.download?.filename}
              >
                <Icon name="download" />
                Download MP4
              </a>
              <button
                className="button primary"
                disabled={!ready || !!uploading || !!textIssues.length}
                onClick={() => void startExport()}
              >
                Export again
              </button>
            </>
          ) : (
            <button
              className="button primary"
              disabled={!ready || !!uploading || !!textIssues.length}
              onClick={() => void startExport()}
            >
              <Icon name="download" />
              {exportState === 'error' ? 'Retry export' : 'Export video'}
            </button>
          )}
        </div>
      </header>
      <aside className="editor-panel" aria-label="Project settings">
        <fieldset className="editor-fields" disabled={rendering || !ready}>
          <section className="control-section screenshots-section">
            <div className="section-heading">
              <h2>Screenshots</h2>
              <span>1–3 images</span>
            </div>
            <button
              className="button upload-action"
              onClick={() => selectFile('main')}
            >
              <Icon name="upload" />
              Use my screenshots
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                const slot = fileSlot.current;
                setUploading(slot);
                try {
                  await replaceAsset(slot, file);
                } finally {
                  setUploading(null);
                }
              }}
              className="visually-hidden"
              aria-label="Choose a screenshot"
            />
            <div className="asset-slots">
              {(['main', 'detail', 'extra'] as AssetSlot[]).map((slot) => {
                const asset = project.assets[slot];
                return (
                  <div
                    className={`asset-slot ${asset ? 'has-image' : ''} ${uploading === slot ? 'is-loading' : ''}`}
                    key={slot}
                  >
                    <button
                      className="asset-thumbnail"
                      disabled={!!uploading}
                      onClick={() => selectFile(slot)}
                      aria-label={`${asset ? 'Replace' : 'Add'} ${slotNames[slot]} screenshot`}
                    >
                      {asset ? (
                        <img src={asset.src} alt="" />
                      ) : (
                        <span className="empty-slot-mark">+</span>
                      )}
                    </button>
                    <div className="asset-description">
                      <span className="asset-name">
                        {slotNames[slot]}
                        <span className="slot-optional">
                          {slot === 'main' ? 'Required' : 'Optional'}
                        </span>
                      </span>
                      <span className="asset-file" title={asset?.name}>
                        {uploading === slot
                          ? 'Preparing image…'
                          : asset
                            ? asset.name.replace(' — generated UI fixture', '')
                            : slot === 'detail'
                              ? 'Uses Main when empty'
                              : 'Add a closing view'}
                      </span>
                    </div>
                    {asset && slot !== 'main' ? (
                      <button
                        className="icon-button slot-action"
                        disabled={!!uploading}
                        onClick={() => clearAsset(slot)}
                        aria-label={`Clear ${slotNames[slot]} screenshot`}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    ) : (
                      <button
                        className="icon-button slot-action"
                        disabled={!!uploading}
                        onClick={() => selectFile(slot)}
                        aria-label={`${asset ? 'Replace' : 'Add'} ${slotNames[slot]} screenshot`}
                      >
                        <Icon name={asset ? 'upload' : 'chevron'} size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="section-note">PNG, JPG or WebP · up to 10 MB each</p>
            {error && (
              <div className="error-message" role="alert">
                <p>{error}</p>
                <button
                  className="icon-button"
                  onClick={dismissError}
                  aria-label="Dismiss error"
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            )}
          </section>
          <section className="control-section content-section">
            <div className="section-heading">
              <h2>Content</h2>
            </div>
            <TextField
              issue={issue('name')}
              label="Product name"
              value={project.name}
              max={40}
              onChange={(name) => update({ name })}
            />
            <TextField
              issue={issue('openingCaption')}
              label="Opening line"
              value={project.openingCaption}
              max={64}
              onChange={(openingCaption) => update({ openingCaption })}
              multiline
            />
            <TextField
              issue={issue('featureCaption')}
              label="Feature caption"
              value={project.featureCaption}
              max={80}
              onChange={(featureCaption) => update({ featureCaption })}
              multiline
            />
            <button
              className={`focus-toggle ${focusOpen ? 'is-open' : ''}`}
              aria-expanded={focusOpen}
              onClick={() => setFocusOpen(!focusOpen)}
            >
              <Icon name="focus" />
              <span>Set detail focus</span>
              <Icon name="chevron" size={13} />
            </button>
            {focusOpen && (
              <div className="focus-editor">
                <p>Click the part you want to bring closer.</p>
                <button
                  className="focus-image"
                  aria-label="Choose detail focal point"
                  onClick={(event) => {
                    if (!event.detail) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    update({
                      focalPoint: {
                        x: Math.max(
                          0,
                          Math.min(1, (event.clientX - rect.left) / rect.width),
                        ),
                        y: Math.max(
                          0,
                          Math.min(1, (event.clientY - rect.top) / rect.height),
                        ),
                      },
                    });
                    seek(180);
                  }}
                  onKeyDown={(event) => {
                    const offset =
                      event.key === 'ArrowRight'
                        ? [0.025, 0]
                        : event.key === 'ArrowLeft'
                          ? [-0.025, 0]
                          : event.key === 'ArrowUp'
                            ? [0, -0.025]
                            : event.key === 'ArrowDown'
                              ? [0, 0.025]
                              : null;
                    if (offset) {
                      event.preventDefault();
                      update({
                        focalPoint: {
                          x: Math.max(
                            0,
                            Math.min(1, project.focalPoint.x + offset[0]),
                          ),
                          y: Math.max(
                            0,
                            Math.min(1, project.focalPoint.y + offset[1]),
                          ),
                        },
                      });
                      seek(180);
                    }
                  }}
                >
                  <img
                    src={detailAsset.src}
                    alt="Detail screenshot. Click to select focus; use arrow keys to adjust."
                  />
                  <span
                    className="focus-crop"
                    style={{
                      left: `${crop.left * 100}%`,
                      top: `${crop.top * 100}%`,
                      width: `${crop.width * 100}%`,
                      height: `${crop.height * 100}%`,
                    }}
                  />
                  <span
                    className="focus-target"
                    style={{
                      left: `${project.focalPoint.x * 100}%`,
                      top: `${project.focalPoint.y * 100}%`,
                    }}
                  >
                    <Icon name="focus" size={20} />
                  </span>
                </button>
                <div className="focus-readout">
                  <span>
                    Focus {Math.round(project.focalPoint.x * 100)}%,{' '}
                    {Math.round(project.focalPoint.y * 100)}%
                  </span>
                  <button
                    onClick={() => update({ focalPoint: { x: 0.5, y: 0.5 } })}
                  >
                    Center
                  </button>
                </div>
              </div>
            )}
            <TextField
              issue={issue('closingUrl')}
              label="Closing URL"
              value={project.closingUrl}
              max={80}
              onChange={(closingUrl) => update({ closingUrl })}
              optional
              placeholder="yourproduct.com"
            />
          </section>
          <section className="control-section style-section">
            <div className="section-heading">
              <h2>Style</h2>
            </div>
            <div
              className="theme-options"
              role="group"
              aria-label="Stage style"
            >
              {(['midnight', 'paper'] as const).map((theme) => (
                <button
                  key={theme}
                  className={`theme-option ${project.theme === theme ? 'is-selected' : ''}`}
                  aria-pressed={project.theme === theme}
                  onClick={() => update({ theme })}
                >
                  <span className={`theme-swatch ${theme}`}>
                    <span />
                  </span>
                  <span>{theme === 'midnight' ? 'Midnight' : 'Paper'}</span>
                  <span className="selection-dot" />
                </button>
              ))}
            </div>
            <div className="accent-heading">
              <label htmlFor="custom-accent">Accent</label>
              <span>{project.accent.toUpperCase()}</span>
            </div>
            <div
              className="accent-options"
              role="group"
              aria-label="Accent color"
            >
              {accents.map((color) => (
                <button
                  className={`accent-swatch ${project.accent.toLowerCase() === color ? 'is-selected' : ''}`}
                  style={{ '--swatch': color } as CSSProperties}
                  key={color}
                  aria-label={`Use ${color} accent`}
                  aria-pressed={project.accent.toLowerCase() === color}
                  onClick={() => update({ accent: color })}
                />
              ))}
              <label className="custom-accent" title="Choose a custom accent">
                <span>+</span>
                <input
                  id="custom-accent"
                  type="color"
                  value={project.accent}
                  onChange={(event) => update({ accent: event.target.value })}
                  aria-label="Custom accent color"
                />
              </label>
            </div>
          </section>
          <section className="project-file-controls">
            <button
              onClick={() => void downloadProject()}
              disabled={!!uploading}
            >
              Download project
            </button>
            <span>·</span>
            <button
              onClick={() => projectInput.current?.click()}
              disabled={!!uploading}
            >
              Open project
            </button>
            <input
              ref={projectInput}
              type="file"
              className="visually-hidden"
              accept=".json,application/json"
              aria-label="Open a Pocket Stage project"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) {
                  setPackageError('');
                  await importPackage(file);
                }
              }}
            />
            {packageError && (
              <p className="inline-fit-error" role="alert">
                {packageError}
              </p>
            )}
          </section>
        </fieldset>
        <footer className="panel-footer">
          <span className="sample-dot" />
          {sample
            ? 'Fieldwork is a sample project'
            : 'Saved locally · landscape project'}
        </footer>
      </aside>
      <section className="studio-workspace" aria-label="Video preview">
        <div className="workspace-heading">
          <h1>Preview</h1>
          <span>
            1920 × 1080<span className="metadata-dot">·</span>12 seconds
            <span className="metadata-dot">·</span>30 fps
          </span>
        </div>
        <div className="preview-viewport">
          <div className="stage-player" ref={stage}>
            <Player
              ref={player}
              component={StageComposition}
              inputProps={{ project }}
              compositionWidth={VIDEO.width}
              compositionHeight={VIDEO.height}
              fps={VIDEO.fps}
              durationInFrames={VIDEO.durationInFrames}
              controls={false}
              clickToPlay={false}
              doubleClickToFullscreen={false}
              spaceKeyToPlayOrPause={false}
              style={{ width: '100%', height: '100%' }}
            />
            <button
              className="stage-play-target"
              onClick={() => player.current?.toggle()}
              aria-label={playing ? 'Pause preview' : 'Play preview'}
              tabIndex={-1}
            />
          </div>
        </div>
        <div className="sequence-controls">
          <div className="shot-strip" aria-label="Sequence shots">
            {shots.map((shot, index) => (
              <button
                key={shot.name}
                className={`shot-button ${activeShot === index ? 'is-selected' : ''}`}
                aria-pressed={activeShot === index}
                onClick={() => {
                  player.current?.pause();
                  seek(shot.frame);
                }}
              >
                <span
                  className={`shot-miniature shot-${index}`}
                  style={{ '--shot-accent': project.accent } as CSSProperties}
                >
                  <img
                    src={
                      index === 1 ? detailAsset.src : project.assets.main.src
                    }
                    alt=""
                  />
                </span>
                <span className="shot-description">
                  <span className="shot-name">{shot.name}</span>
                  <span className="shot-subtitle">{shot.description}</span>
                </span>
                <span className="shot-time">
                  {shot.start}–{shot.end}s
                </span>
              </button>
            ))}
          </div>
          <label className="scrubber-label">
            <span className="visually-hidden">Preview position in frames</span>
            <input
              className="scrubber"
              aria-label="Preview position"
              type="range"
              min="0"
              max="359"
              value={frame}
              onChange={(event) => {
                player.current?.pause();
                seek(Number(event.target.value));
              }}
              style={
                { '--progress': `${(frame / 359) * 100}%` } as CSSProperties
              }
            />
          </label>
          <div className="playback-row">
            <div className="playback-left">
              <button
                className="icon-button"
                aria-label="Restart preview"
                title="Restart · Home"
                onClick={() => seek(0)}
              >
                <Icon name="restart" />
              </button>
              <span className="timecode">
                {(frame / 30).toFixed(2)}
                <span> / 12.00</span>
              </span>
            </div>
            <div className="playback-center">
              <button
                className="icon-button frame-step"
                aria-label="Previous frame"
                title="Previous frame · Left arrow"
                onClick={() => {
                  player.current?.pause();
                  seek(frame - 1);
                }}
              >
                <Icon name="previous" />
              </button>
              <button
                className="play-button"
                aria-label={playing ? 'Pause preview' : 'Play preview'}
                title="Play or pause · Space"
                onClick={() => player.current?.toggle()}
              >
                <Icon name={playing ? 'pause' : 'play'} size={17} />
              </button>
              <button
                className="icon-button frame-step"
                aria-label="Next frame"
                title="Next frame · Right arrow"
                onClick={() => {
                  player.current?.pause();
                  seek(frame + 1);
                }}
              >
                <Icon name="next" />
              </button>
            </div>
            <div className="playback-right">
              <span className="frame-readout">
                Frame {String(frame).padStart(3, '0')}
              </span>
              <button
                className="icon-button"
                aria-label="Fullscreen preview"
                title="Fullscreen"
                onClick={() =>
                  void (document.fullscreenElement
                    ? document.exitFullscreen()
                    : stage.current?.requestFullscreen())
                }
              >
                <Icon name="fullscreen" />
              </button>
            </div>
          </div>
        </div>
        <div
          className={`workspace-status ${exportState === 'error' ? 'has-error' : ''}`}
          aria-live="polite"
        >
          {textIssues.length ? (
            <span className="inline-fit-error" role="alert">
              Shorten the highlighted text before exporting.
            </span>
          ) : exportStatus ? (
            <>
              <span className={rendering ? 'status-working' : ''} />
              <span>
                {exportStatus}
                {rendering ? ' · Editing resumes after export.' : ''}
              </span>
            </>
          ) : (
            <>
              <span>Three shots. One continuous story.</span>
              <span className="shortcut-hint">
                <kbd>space</kbd> to play
              </span>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
function TextField({
  label,
  value,
  max,
  onChange,
  multiline,
  optional,
  placeholder,
  issue,
}: {
  label: string;
  value: string;
  max: number;
  onChange: (value: string) => void;
  multiline?: boolean;
  optional?: boolean;
  placeholder?: string;
  issue?: string;
}) {
  const id = `field-${label.toLowerCase().replaceAll(' ', '-')}`;
  return (
    <div className="text-field">
      <div className="field-label">
        <label htmlFor={id}>
          {label}
          {optional && <span>Optional</span>}
        </label>
        <span className="character-count">
          {value.length}/{max}
        </span>
      </div>
      {multiline ? (
        <textarea
          aria-invalid={!!issue}
          aria-describedby={issue ? `${id}-error` : undefined}
          id={id}
          rows={2}
          value={value}
          maxLength={max}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
        />
      ) : (
        <input
          aria-invalid={!!issue}
          aria-describedby={issue ? `${id}-error` : undefined}
          id={id}
          type="text"
          value={value}
          maxLength={max}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          spellCheck={false}
        />
      )}
      {issue && (
        <p className="inline-fit-error" id={`${id}-error`} role="alert">
          {issue}
        </p>
      )}
    </div>
  );
}

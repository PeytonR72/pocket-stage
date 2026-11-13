import React, { useEffect, useMemo, useState } from 'react';
import {
  AbsoluteFill,
  staticFile,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import type { StageCompositionProps, StageAsset } from './types';
import {
  availableAssets,
  cardPose,
  copyVisibility,
  ease,
  fitCopy,
  imageCrop,
  TEXT_BOUNDS,
  type CardPose,
} from './direction';

export const STAGE_FONT = 'Pocket Manrope';
let fontPromise: Promise<FontFace> | undefined;
const loadFont = () => {
  if (!fontPromise) {
    const font = new FontFace(
      STAGE_FONT,
      `url("${staticFile('fonts/Manrope.ttf')}")`,
      { weight: '200 800' },
    );
    fontPromise = font.load().then((loaded) => {
      document.fonts.add(loaded);
      return loaded;
    });
  }
  return fontPromise;
};
const textureUsers = new Map<
  string,
  { texture: THREE.Texture; count: number }
>();
/** Export finally may also clear a private URL whose loader suspended before mounting. */
export const releaseStageTextureCache = (urls: string[]) => {
  for (const src of urls) {
    const entry = textureUsers.get(src);
    if (entry?.count) continue;
    entry?.texture.dispose();
    textureUsers.delete(src);
    useLoader.clear(THREE.TextureLoader, src);
  }
};
function useScreenshotTexture(src: string) {
  const texture = useLoader(THREE.TextureLoader, src);
  texture.colorSpace = THREE.SRGBColorSpace;
  useEffect(() => {
    const entry = textureUsers.get(src) ?? { texture, count: 0 };
    entry.count++;
    textureUsers.set(src, entry);
    texture.needsUpdate = true;
    return () => {
      entry.count--;
      if (entry.count === 0) {
        entry.texture.dispose();
        textureUsers.delete(src);
        useLoader.clear(THREE.TextureLoader, src);
      }
    };
  }, [src, texture]);
  return texture;
}
function roundedShape(width: number, height: number, radius: number) {
  const s = new THREE.Shape(),
    x = -width / 2,
    y = -height / 2;
  s.moveTo(x + radius, y);
  s.lineTo(x + width - radius, y);
  s.quadraticCurveTo(x + width, y, x + width, y + radius);
  s.lineTo(x + width, y + height - radius);
  s.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  s.lineTo(x + radius, y + height);
  s.quadraticCurveTo(x, y + height, x, y + height - radius);
  s.lineTo(x, y + radius);
  s.quadraticCurveTo(x, y, x + radius, y);
  return s;
}
function Screenshot({
  asset,
  paper,
  pose,
  focal,
}: {
  asset: StageAsset;
  paper: boolean;
  pose: CardPose;
  focal: { x: number; y: number };
}) {
  const texture = useScreenshotTexture(asset.src);
  const { width, height, opacity } = pose;
  const crop = imageCrop(asset, width, height, pose.zoom, focal);
  const frameGeometry = useMemo(
    () => new THREE.ShapeGeometry(roundedShape(width + 14, height + 42, 13)),
    [width, height],
  );
  const imageGeometry = useMemo(() => {
    const geometry = new THREE.ShapeGeometry(roundedShape(width, height, 7));
    const positions = geometry.getAttribute('position'),
      uv = geometry.getAttribute('uv');
    for (let i = 0; i < positions.count; i++) {
      uv.setXY(
        i,
        crop.left + (positions.getX(i) / width + 0.5) * crop.width,
        1 -
          crop.top -
          crop.height +
          (positions.getY(i) / height + 0.5) * crop.height,
      );
    }
    return geometry;
  }, [width, height, crop.left, crop.top, crop.width, crop.height]);
  useEffect(() => () => frameGeometry.dispose(), [frameGeometry]);
  useEffect(() => () => imageGeometry.dispose(), [imageGeometry]);
  return (
    <group
      position={[pose.x - 960, 540 - pose.y, pose.z]}
      rotation={[pose.rx, pose.ry, pose.rz]}
    >
      <mesh geometry={frameGeometry} position={[0, 14, -1]}>
        <meshBasicMaterial
          color={paper ? '#faf9f5' : '#283133'}
          transparent
          opacity={opacity}
          toneMapped={false}
        />
      </mesh>
      <mesh geometry={imageGeometry} position={[0, 0, 0]}>
        <meshBasicMaterial
          color={paper ? '#faf9f5' : '#192022'}
          transparent
          opacity={opacity}
          toneMapped={false}
        />
      </mesh>
      <mesh geometry={imageGeometry} position={[0, 0, 0.2]}>
        <meshBasicMaterial
          map={texture}
          transparent
          opacity={opacity}
          toneMapped={false}
        />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          position={[-width / 2 + 17 + i * 16, height / 2 + 21, 0.5]}
        >
          <circleGeometry args={[3, 16]} />
          <meshBasicMaterial
            color={paper ? '#b6b9b1' : '#6b7673'}
            transparent
            opacity={opacity}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
function Copy({
  text,
  width,
  preferred,
  lines,
  style,
}: {
  text: string;
  width: number;
  preferred: number;
  lines: number;
  style?: React.CSSProperties;
}) {
  const fitted = fitCopy(text, width, preferred, lines);
  return (
    <div
      data-text-fit={fitted.fits ? 'fits' : 'overflow'}
      style={{
        width,
        fontSize: fitted.fontSize,
        lineHeight: 1.18,
        whiteSpace: 'pre-line',
        overflowWrap: 'anywhere',
        ...style,
      }}
    >
      {fitted.text}
    </div>
  );
}
/** Shared, deterministic video scene. All motion is derived from the Remotion frame. */
export const StageComposition: React.FC<StageCompositionProps> = ({
  project,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [fontHandle] = useState(() =>
    delayRender('Loading the bundled stage typeface'),
  );
  useEffect(() => {
    let active = true;
    loadFont()
      .then(() => {
        if (active) continueRender(fontHandle);
      })
      .catch(cancelRender);
    return () => {
      active = false;
    };
  }, [continueRender, cancelRender, fontHandle]);
  const paper = project.theme === 'paper';
  const assets = availableAssets(project);
  const poses = assets.map((asset, index) =>
    cardPose(project, asset, index, frame),
  );
  const copy = copyVisibility(frame);
  const focusMix = ease(frame, 108, 170) * (1 - ease(frame, 228, 282));
  const focal = {
    x: 0.5 + (project.focalPoint.x - 0.5) * focusMix,
    y: 0.5 + (project.focalPoint.y - 0.5) * focusMix,
  };
  const opening = fitCopy(project.name, TEXT_BOUNDS.name.width, 76, 2);
  const titleHeight = opening.lines * opening.fontSize * 1.18;
  return (
    <AbsoluteFill
      data-stage-frame={frame}
      style={{
        backgroundColor: paper ? '#f0ede5' : '#111719',
        color: paper ? '#242b29' : '#f3f0e9',
        fontFamily: `"${STAGE_FONT}", sans-serif`,
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(ellipse at 69% 51%, ${project.accent} 0%, transparent 62%)`,
          opacity: paper ? 0.18 : 0.135,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 970,
          height: 110,
          backgroundImage: `linear-gradient(transparent, ${paper ? 'rgba(111,100,78,.055)' : 'rgba(0,0,0,.20)'})`,
        }}
      />
      {poses.map((pose, i) => (
        <div
          key={assets[i].id}
          style={{
            position: 'absolute',
            left: pose.x - pose.width * 0.36,
            top: pose.y + pose.height * 0.48 + 14,
            width: pose.width * 0.72,
            height: 10,
            borderRadius: '50%',
            opacity: pose.opacity * (paper ? 0.45 : 0.6),
            boxShadow: `0 18px 32px 14px ${paper ? 'rgba(35,31,23,.16)' : 'rgba(0,0,0,.45)'}`,
            transform: `rotate(${(-pose.rz * 180) / Math.PI}deg)`,
          }}
        />
      ))}
      <ThreeCanvas
        width={width}
        height={height}
        camera={{
          fov: (2 * Math.atan(540 / 2200) * 180) / Math.PI,
          position: [0, 0, 2200],
          near: 100,
          far: 4000,
        }}
        gl={{
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true,
          toneMapping: THREE.NoToneMapping,
        }}
        style={{ position: 'absolute', inset: 0 }}
      >
        {assets.map((asset, index) => (
          <Screenshot
            key={asset.id + asset.src}
            asset={asset}
            paper={paper}
            pose={poses[index]}
            focal={focal}
          />
        ))}
      </ThreeCanvas>
      <div
        style={{
          position: 'absolute',
          left: 108,
          top: 272 - Math.min(70, (titleHeight - 90) / 2),
          opacity: copy.reveal,
        }}
      >
        <Copy
          text={project.name}
          width={TEXT_BOUNDS.name.width}
          preferred={76}
          lines={2}
          style={{ fontWeight: 600, letterSpacing: '-.035em' }}
        />
        {project.openingCaption && (
          <Copy
            text={project.openingCaption}
            width={TEXT_BOUNDS.openingCaption.width}
            preferred={36}
            lines={2}
            style={{
              marginTop: 30,
              color: paper ? '#4f5c55' : '#bcc9c2',
              letterSpacing: '-.015em',
              lineHeight: 1.35,
            }}
          />
        )}
      </div>
      {project.featureCaption && (
        <div
          style={{
            position: 'absolute',
            left: 108,
            top: 342,
            opacity: copy.detail,
          }}
        >
          <Copy
            text={project.featureCaption}
            width={TEXT_BOUNDS.featureCaption.width}
            preferred={48}
            lines={3}
            style={{
              fontWeight: 500,
              letterSpacing: '-.028em',
              lineHeight: 1.24,
            }}
          />
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          top: 74,
          left: 170,
          width: 1580,
          opacity: copy.showcase,
          textAlign: 'center',
        }}
      >
        <Copy
          text={project.name}
          width={1580}
          preferred={74}
          lines={2}
          style={{ fontWeight: 600, letterSpacing: '-.035em' }}
        />
        {project.closingUrl && (
          <Copy
            text={project.closingUrl}
            width={1450}
            preferred={30}
            lines={2}
            style={{
              margin: '20px auto 0',
              color: paper ? '#4f5c55' : '#bcc9c2',
              lineHeight: 1.3,
            }}
          />
        )}
      </div>
    </AbsoluteFill>
  );
};

import { useMemo } from 'react';

function StarField() {
  const points = useMemo(() => {
    const count = 1200;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 40 + Math.random() * 60;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    return positions;
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[points, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.08} color="#c8d6e5" transparent opacity={0.7} sizeAttenuation />
    </points>
  );
}

function SparseVoidPoints() {
  const points = useMemo(() => {
    const count = 260;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 10 + Math.random() * 22;
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
    }

    return positions;
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[points, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.012}
        color="#ffffff"
        transparent
        opacity={0.34}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

interface EmotionSpaceAreasProps {
  visible?: boolean;
  lite?: boolean;
}

export function EmotionSpaceAreas({ visible = true, lite = false }: EmotionSpaceAreasProps) {
  if (!visible) {
    return null;
  }

  return (
    <group>
      {!lite && <StarField />}
      <SparseVoidPoints />
      <ambientLight intensity={lite ? 0.4 : 0.35} />
      {!lite && (
        <>
          <pointLight position={[8, 6, 10]} intensity={1.2} color="#a8c8ff" />
          <pointLight position={[-6, -4, -8]} intensity={0.6} color="#ff9eb5" />
        </>
      )}
    </group>
  );
}


import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export default function FishingGame() {
  const mountRef = useRef(null);
  const [message, setMessage] = useState('Klicke zum Auswerfen');
  const [score, setScore] = useState(0);
  const [fishCaught, setFishCaught] = useState(0);
  const [powerBar, setPowerBar] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!mountRef.current) return;

    let animationId;
    let renderer;
    let powerInterval = null;

    try {
      console.log('Initializing Enhanced Fishing Game...');

      // ----- Scene + Camera -----
      const scene = new THREE.Scene();
      
      // Gradient Sky - WICHTIG: Immer gesetzt
      scene.background = new THREE.Color(0x87CEEB);
      scene.fog = new THREE.Fog(0xB0E0E6, 100, 400);

      const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
      );
      camera.position.set(0, 2.5, 6);

      // ----- Renderer -----
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      mountRef.current.appendChild(renderer.domElement);

      console.log('Renderer initialized');

      // ----- Realistic Water -----
      const waterGeometry = new THREE.PlaneGeometry(1000, 1000, 128, 128);
      
      const waterMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          waterColor: { value: new THREE.Color(0x0077be) },
          deepWaterColor: { value: new THREE.Color(0x003d5c) },
          sunDirection: { value: new THREE.Vector3(0.5, 0.5, 0.3).normalize() }
        },
        vertexShader: `
          uniform float time;
          varying vec2 vUv;
          varying float vElevation;
          varying vec3 vNormal;
          
          void main() {
            vUv = uv;
            vec3 pos = position;
            
            float wave1 = sin(pos.x * 0.3 + time * 0.8) * 0.15;
            float wave2 = sin(pos.z * 0.2 + time * 0.5) * 0.12;
            float wave3 = sin((pos.x + pos.z) * 0.15 + time * 1.2) * 0.08;
            float wave4 = sin(pos.x * 0.8 - pos.z * 0.6 + time * 2.0) * 0.05;
            
            pos.y += wave1 + wave2 + wave3 + wave4;
            vElevation = pos.y;
            
            vec3 tangent = vec3(1.0, 
              cos(pos.x * 0.3 + time * 0.8) * 0.3 * 0.15 +
              cos(pos.x * 0.8 - pos.z * 0.6 + time * 2.0) * 0.8 * 0.05,
              0.0);
            vec3 bitangent = vec3(0.0,
              cos(pos.z * 0.2 + time * 0.5) * 0.2 * 0.12 +
              cos((pos.x + pos.z) * 0.15 + time * 1.2) * 0.15 * 0.08,
              1.0);
            vNormal = normalize(cross(tangent, bitangent));
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 waterColor;
          uniform vec3 deepWaterColor;
          uniform vec3 sunDirection;
          varying vec2 vUv;
          varying float vElevation;
          varying vec3 vNormal;
          
          void main() {
            vec3 color = mix(deepWaterColor, waterColor, smoothstep(-0.3, 0.3, vElevation));
            
            vec3 viewDirection = normalize(cameraPosition - vec3(vUv.x * 100.0, vElevation, vUv.y * 100.0));
            float fresnel = pow(1.0 - max(dot(viewDirection, vNormal), 0.0), 3.0);
            color = mix(color, vec3(0.8, 0.9, 1.0), fresnel * 0.4);
            
            vec3 reflection = reflect(-sunDirection, vNormal);
            float spec = pow(max(dot(reflection, viewDirection), 0.0), 128.0);
            color += vec3(1.0, 0.95, 0.8) * spec * 0.8;
            
            float highlight = smoothstep(0.15, 0.25, vElevation);
            color += vec3(0.2, 0.3, 0.4) * highlight;
            
            gl_FragColor = vec4(color, 0.95);
          }
        `,
        transparent: true,
        side: THREE.DoubleSide
      });
      
      const water = new THREE.Mesh(waterGeometry, waterMaterial);
      water.rotation.x = -Math.PI / 2;
      water.receiveShadow = true;
      scene.add(water);

      // ----- Beleuchtung -----
      const sun = new THREE.DirectionalLight(0xfff4e6, 1.2);
      sun.position.set(100, 80, 50);
      sun.castShadow = true;
      sun.shadow.camera.left = -100;
      sun.shadow.camera.right = 100;
      sun.shadow.camera.top = 100;
      sun.shadow.camera.bottom = -100;
      sun.shadow.mapSize.width = 2048;
      sun.shadow.mapSize.height = 2048;
      sun.shadow.bias = -0.0001;
      scene.add(sun);

      const ambient = new THREE.AmbientLight(0xB0E0E6, 0.6);
      scene.add(ambient);

      const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x0077be, 0.4);
      scene.add(hemiLight);

      console.log('Realistic water and lighting added');

      // ----- Angel -----
      const rodGroup = new THREE.Group();
      
      // Griff
      const handleGeometry = new THREE.CylinderGeometry(0.035, 0.038, 0.6, 16);
      const handleMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x8B4513,
        roughness: 0.8,
        metalness: 0.1
      });
      const handle = new THREE.Mesh(handleGeometry, handleMaterial);
      handle.position.y = -0.3;
      handle.castShadow = true;
      rodGroup.add(handle);

      // Rollenhalter
      const reelSeatGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.15, 12);
      const reelSeatMat = new THREE.MeshStandardMaterial({
        color: 0x808080,
        metalness: 0.9,
        roughness: 0.2
      });
      const reelSeat = new THREE.Mesh(reelSeatGeo, reelSeatMat);
      reelSeat.position.y = 0.1;
      reelSeat.castShadow = true;
      rodGroup.add(reelSeat);

      // Rolle
      const reelBodyGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16);
      const reelMat = new THREE.MeshStandardMaterial({
        color: 0x404040,
        metalness: 0.8,
        roughness: 0.3
      });
      const reelBody = new THREE.Mesh(reelBodyGeo, reelMat);
      reelBody.rotation.z = Math.PI / 2;
      reelBody.position.set(-0.05, 0.1, 0);
      reelBody.castShadow = true;
      rodGroup.add(reelBody);

      // Ruten-Segmente
      const createRodSection = (length, startRadius, endRadius, yOffset, color) => {
        const geo = new THREE.CylinderGeometry(startRadius, endRadius, length, 12);
        const mat = new THREE.MeshStandardMaterial({
          color: color,
          metalness: 0.4,
          roughness: 0.3,
          emissive: color,
          emissiveIntensity: 0.05
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = yOffset;
        mesh.castShadow = true;
        return mesh;
      };

      rodGroup.add(createRodSection(0.8, 0.022, 0.018, 0.5, 0x1a1a2e));
      rodGroup.add(createRodSection(0.7, 0.018, 0.014, 1.25, 0x16213e));
      rodGroup.add(createRodSection(0.6, 0.014, 0.008, 1.9, 0x0f3460));
      rodGroup.add(createRodSection(0.4, 0.008, 0.003, 2.4, 0x0a2463));

      // Ruten-Ringe
      const guidePositions = [0.3, 0.7, 1.1, 1.5, 1.9, 2.2];
      guidePositions.forEach(yPos => {
        const ringGeo = new THREE.TorusGeometry(0.025, 0.003, 8, 16);
        const ringMat = new THREE.MeshStandardMaterial({
          color: 0xc0c0c0,
          metalness: 0.9,
          roughness: 0.1
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.y = yPos;
        ring.rotation.x = Math.PI / 2;
        ring.castShadow = true;
        rodGroup.add(ring);

        const footGeo = new THREE.CylinderGeometry(0.003, 0.006, 0.04, 6);
        const foot = new THREE.Mesh(footGeo, ringMat);
        foot.position.set(0, yPos - 0.02, 0);
        foot.castShadow = true;
        rodGroup.add(foot);
      });

      rodGroup.position.set(0.6, 1.2, -0.3);
      rodGroup.rotation.set(-0.4, -0.15, 0.05);
      camera.add(rodGroup);
      scene.add(camera);

      // ----- Leine & Pose -----
      const lineMaterial = new THREE.LineBasicMaterial({ 
        color: 0x9ACD32,
        linewidth: 2,
        transparent: true,
        opacity: 0.9
      });
      const linePoints = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, -5, -10)
      ];
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
      const line = new THREE.Line(lineGeometry, lineMaterial);
      line.visible = false;
      rodGroup.add(line);

      // Pose
      const bobberGroup = new THREE.Group();
      
      const bobberTopGeo = new THREE.SphereGeometry(0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      const bobberTopMat = new THREE.MeshStandardMaterial({ 
        color: 0xff3333,
        metalness: 0.3,
        roughness: 0.4
      });
      const bobberTop = new THREE.Mesh(bobberTopGeo, bobberTopMat);
      bobberTop.castShadow = true;
      bobberGroup.add(bobberTop);

      const bobberBottomGeo = new THREE.SphereGeometry(0.12, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      const bobberBottomMat = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        metalness: 0.3,
        roughness: 0.4
      });
      const bobberBottom = new THREE.Mesh(bobberBottomGeo, bobberBottomMat);
      bobberBottom.castShadow = true;
      bobberGroup.add(bobberBottom);

      const antennaGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.25, 8);
      const antennaMat = new THREE.MeshStandardMaterial({ 
        color: 0xffff00,
        emissive: 0xffff00,
        emissiveIntensity: 0.3
      });
      const antenna = new THREE.Mesh(antennaGeo, antennaMat);
      antenna.position.y = 0.2;
      antenna.castShadow = true;
      bobberGroup.add(antenna);

      bobberGroup.visible = false;
      scene.add(bobberGroup);

      // ----- Fisch -----
      const fishGroup = new THREE.Group();
      
      const fishBodyGeo = new THREE.SphereGeometry(0.25, 20, 16);
      fishBodyGeo.scale(2.2, 1.0, 0.9);
      const fishMat = new THREE.MeshStandardMaterial({
        color: 0xFFA500,
        metalness: 0.6,
        roughness: 0.3,
        emissive: 0xFF8C00,
        emissiveIntensity: 0.1
      });
      const fishBody = new THREE.Mesh(fishBodyGeo, fishMat);
      fishBody.castShadow = true;
      fishGroup.add(fishBody);

      const tailGeo = new THREE.ConeGeometry(0.22, 0.5, 16);
      tailGeo.rotateX(Math.PI / 2);
      const tail = new THREE.Mesh(tailGeo, fishMat);
      tail.position.x = -0.6;
      tail.scale.set(1, 1.5, 0.4);
      tail.castShadow = true;
      fishGroup.add(tail);

      const dorsalFinGeo = new THREE.ConeGeometry(0.12, 0.25, 12);
      dorsalFinGeo.rotateZ(Math.PI / 2);
      const dorsalFin = new THREE.Mesh(dorsalFinGeo, fishMat);
      dorsalFin.position.set(0, 0.25, 0);
      dorsalFin.scale.set(1, 0.8, 0.3);
      dorsalFin.castShadow = true;
      fishGroup.add(dorsalFin);

      [-1, 1].forEach(side => {
        const sideFinGeo = new THREE.ConeGeometry(0.08, 0.18, 12);
        sideFinGeo.rotateZ(Math.PI / 2);
        const sideFin = new THREE.Mesh(sideFinGeo, fishMat);
        sideFin.position.set(0.1, -0.1, side * 0.2);
        sideFin.rotation.y = side * Math.PI / 4;
        sideFin.scale.set(1, 1, 0.2);
        sideFin.castShadow = true;
        fishGroup.add(sideFin);
      });

      [-1, 1].forEach(side => {
        const eyeGeo = new THREE.SphereGeometry(0.04, 12, 12);
        const eyeMat = new THREE.MeshStandardMaterial({ 
          color: 0x000000,
          metalness: 1.0,
          roughness: 0.1
        });
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(0.35, 0.08, side * 0.18);
        fishGroup.add(eye);
      });

      fishGroup.visible = false;
      scene.add(fishGroup);

      console.log('All objects created');

      // ----- Game State -----
      let currentState = 'ready';
      let castDistance = 0;
      const bobberPosition = new THREE.Vector3();
      let biteTime = 0;
      let rodAngle = -0.4;

      const clock = new THREE.Clock();

      // ----- Animation Loop -----
      function animate() {
        animationId = requestAnimationFrame(animate);
        const elapsedTime = clock.getElapsedTime();

        // Update water shader - WICHTIG: Immer aktualisieren
        waterMaterial.uniforms.time.value = elapsedTime;

        // Game states
        if (currentState === 'casting') {
          rodAngle += 0.15;
          if (rodAngle > 0.6) {
            currentState = 'waiting';
            rodAngle = 0.2;
            line.visible = true;
            bobberGroup.visible = true;
            bobberGroup.position.set(bobberPosition.x, 0.15, bobberPosition.z);
            setMessage('Warte auf einen Biss...');
            biteTime = elapsedTime + 2.0 + Math.random() * 4.0;
          }
        } else if (currentState === 'waiting') {
          bobberGroup.position.y = 0.15 + Math.sin(elapsedTime * 1.5) * 0.08 + Math.sin(elapsedTime * 3) * 0.03;
          bobberGroup.rotation.z = Math.sin(elapsedTime * 2) * 0.1;
          
          const lp = line.geometry.attributes.position.array;
          lp[3] = bobberGroup.position.x - camera.position.x;
          lp[4] = bobberGroup.position.y - camera.position.y - 2.3;
          lp[5] = bobberGroup.position.z - camera.position.z;
          line.geometry.attributes.position.needsUpdate = true;

          if (elapsedTime > biteTime) {
            currentState = 'biting';
            setMessage('BISS! Klicke jetzt!');
            setTimeout(() => {
              if (currentState === 'biting') {
                currentState = 'ready';
                line.visible = false;
                bobberGroup.visible = false;
                setMessage('Verpasst! Klicke zum Auswerfen');
              }
            }, 2500);
          }
        } else if (currentState === 'biting') {
          bobberGroup.position.y = 0.15 + Math.sin(elapsedTime * 12) * 0.3;
          bobberGroup.rotation.z = Math.sin(elapsedTime * 10) * 0.3;
          
          const lp = line.geometry.attributes.position.array;
          lp[3] = bobberGroup.position.x - camera.position.x;
          lp[4] = bobberGroup.position.y - camera.position.y - 2.3;
          lp[5] = bobberGroup.position.z - camera.position.z;
          line.geometry.attributes.position.needsUpdate = true;
        } else if (currentState === 'catching') {
          const targetZ = camera.position.z - 1.5;
          bobberGroup.position.z += (targetZ - bobberGroup.position.z) * 0.15;
          bobberGroup.position.y = 0.6 + Math.sin(elapsedTime * 8) * 0.2;
          bobberGroup.rotation.y = elapsedTime * 3;

          fishGroup.position.copy(bobberGroup.position);
          fishGroup.position.y -= 0.3;
          fishGroup.rotation.y = elapsedTime * 5;
          fishGroup.rotation.x = Math.sin(elapsedTime * 6) * 0.3;

          const lp = line.geometry.attributes.position.array;
          lp[3] = bobberGroup.position.x - camera.position.x;
          lp[4] = bobberGroup.position.y - camera.position.y - 2.3;
          lp[5] = bobberGroup.position.z - camera.position.z;
          line.geometry.attributes.position.needsUpdate = true;

          if (bobberGroup.position.distanceTo(camera.position) < 2.5) {
            currentState = 'caught';
            const points = Math.floor(20 + Math.random() * 80);
            setScore(prev => prev + points);
            setFishCaught(prev => prev + 1);
            setMessage(`Gefangen! +${points} Punkte!`);
            
            // Fisch vor Kamera positionieren
            fishGroup.visible = true;
            fishGroup.position.set(0, 2, -2.5);
            fishGroup.rotation.set(0, 0, 0);

            setTimeout(() => {
              currentState = 'ready';
              line.visible = false;
              bobberGroup.visible = false;
              fishGroup.visible = false;
              setMessage('Klicke zum Auswerfen');
            }, 2000);
          }
        } else if (currentState === 'caught') {
          // Fisch-Animation beim Präsentieren
          fishGroup.rotation.y = elapsedTime * 2;
          fishGroup.position.y = 2 + Math.sin(elapsedTime * 3) * 0.1;
        }

        rodGroup.rotation.x = rodAngle;
        
        // WICHTIG: Szene IMMER rendern
        renderer.render(scene, camera);
      }
      animate();

      // ----- Controls -----
      let powerCharging = false;
      let currentPower = 0;

      const onPointerDown = (_e) => {
        if (currentState === 'ready') {
          powerCharging = true;
          currentPower = 0;
          setPowerBar(0);

          powerInterval = setInterval(() => {
            currentPower += 2.5;
            if (currentPower >= 100) currentPower = 100;
            setPowerBar(currentPower);
          }, 40);
        }
      };

      const onPointerUp = (_e) => {
        if (currentState === 'ready' && powerCharging) {
          powerCharging = false;
          clearInterval(powerInterval);
          powerInterval = null;

          currentState = 'casting';
          castDistance = 8 + (currentPower / 100) * 25;

          const angle = -0.2 + (Math.random() - 0.5) * 0.4;
          bobberPosition.set(
            Math.sin(angle) * castDistance,
            0,
            -Math.cos(angle) * castDistance
          );

          rodAngle = -0.9;
          setMessage('Wurf...');
          setPowerBar(0);
        }
      };

      const onKeyDown = (e) => {
        if ((e.code === 'Space' || e.key === ' ') && currentState === 'biting') {
          e.preventDefault();
          currentState = 'catching';
          fishGroup.visible = true;
          fishGroup.position.copy(bobberGroup.position);
          fishGroup.position.y -= 0.3;
          setMessage('Einrollen! Halte die Maustaste!');
        }
      };

      const onPointerClick = (e) => {
        if (currentState === 'biting') {
          e.preventDefault();
          currentState = 'catching';
          fishGroup.visible = true;
          fishGroup.position.copy(bobberGroup.position);
          fishGroup.position.y -= 0.3;
          setMessage('Einrollen! Halte die Maustaste!');
        }
      };

      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointerup', onPointerUp);
      renderer.domElement.addEventListener('click', onPointerClick);
      renderer.domElement.addEventListener('touchstart', onPointerDown, { passive: true });
      renderer.domElement.addEventListener('touchend', onPointerUp);
      window.addEventListener('keydown', onKeyDown);

      // ----- Resize -----
      const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener('resize', onResize);

      console.log('Game fully initialized');

      // ----- Cleanup -----
      return () => {
        cancelAnimationFrame(animationId);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('keydown', onKeyDown);
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer.domElement.removeEventListener('pointerup', onPointerUp);
        renderer.domElement.removeEventListener('click', onPointerClick);
        renderer.domElement.removeEventListener('touchstart', onPointerDown);
        renderer.domElement.removeEventListener('touchend', onPointerUp);

        if (powerInterval) clearInterval(powerInterval);

        renderer.dispose();
        if (mountRef.current && renderer.domElement) {
          mountRef.current.removeChild(renderer.domElement);
        }
      };
    } catch (err) {
      console.error('Error initializing game:', err);
      setError(err.message);
    }
  }, []);

  if (error) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a1a1a',
        color: 'white',
        fontFamily: 'Arial, sans-serif',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <div>
          <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Fehler</h2>
          <p style={{ color: '#ff6b6b' }}>{error}</p>
          <p style={{ marginTop: '1rem', color: '#aaa' }}>
            Bitte lade die Seite neu oder kontaktiere den Support.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        color: 'white',
        fontFamily: 'Arial, sans-serif',
        fontWeight: '700',
        fontSize: 24,
        textShadow: '0 3px 10px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.5)',
        zIndex: 10,
        background: 'rgba(0,0,0,0.3)',
        padding: '12px 20px',
        borderRadius: 12,
        backdropFilter: 'blur(8px)'
      }}>
        <div style={{ marginBottom: 8 }}>Punkte: {score}</div>
        <div>Gefangen: {fishCaught}</div>
      </div>

      <div style={{
        position: 'absolute',
        bottom: 120,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '16px 36px',
        background: 'rgba(0,0,0,0.75)',
        color: 'white',
        fontSize: 26,
        borderRadius: 16,
        fontFamily: 'Arial, sans-serif',
        fontWeight: '700',
        textAlign: 'center',
        pointerEvents: 'none',
        zIndex: 10,
        backdropFilter: 'blur(10px)',
        border: '2px solid rgba(255,255,255,0.1)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
      }}>
        {message}
      </div>

      {powerBar > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 60,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 360,
          height: 32,
          background: 'rgba(0,0,0,0.7)',
          borderRadius: 20,
          border: '3px solid rgba(255,255,255,0.2)',
          overflow: 'hidden',
          pointerEvents: 'none',
          zIndex: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)'
        }}>
          <div style={{
            width: `${powerBar}%`,
            height: '100%',
            background: 'linear-gradient(90deg,#00ff7a,#fff200,#ff4d4d)',
            transition: 'width 50ms linear',
            boxShadow: 'inset 0 2px 8px rgba(255,255,255,0.3)'
          }} />
        </div>
      )}

      <div style={{
        position: 'absolute',
        top: 20,
        right: 20,
        padding: '12px 16px',
        background: 'rgba(0,0,0,0.5)',
        color: 'white',
        fontSize: 14,
        borderRadius: 12,
        fontFamily: 'Arial, sans-serif',
        pointerEvents: 'none',
        zIndex: 10,
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{ fontWeight: '700', marginBottom: 8, fontSize: 16 }}>Steuerung</div>
        <div style={{ opacity: 0.9 }}>• Halten = Kraft laden</div>
        <div style={{ opacity: 0.9 }}>• Loslassen = Auswerfen</div>
        <div style={{ opacity: 0.9 }}>• LEERTASTE bei Biss</div>
      </div>
    </div>
  );
}

import * as THREE from "/vendor/three/three.module.js";

const ROLE_COLORS = {
  coding: "#66ecff",
  research: "#ffd86d",
  testing: "#7cf5b4",
  debug: "#ff8d73",
  deploy: "#ffbe5f"
};

const BUG_COLORS = {
  Bug: "#ff6687",
  CriticalBug: "#ff9e73",
  MemoryLeakMonster: "#d3ff6a",
  TestFailureGhost: "#9ae7ff",
  BossBug: "#ff6cff"
};

const effectUsesRing = new Set(["spawnRing", "scannerWave", "pulse"]);
const effectUsesSprite = new Set(["spark", "bugSplat", "explosion", "collapse", "launchTrail"]);

const createGlowTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(64, 64, 8, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(255,255,255,0.75)");
  gradient.addColorStop(0.7, "rgba(255,255,255,0.12)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return new THREE.CanvasTexture(canvas);
};

const createFresnelMaterial = (color) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uActivity: { value: 0.2 },
      uColor: { value: new THREE.Color(color) }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      uniform float uTime;
      uniform float uActivity;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mvPosition.xyz);
        vec3 displaced = position + normal * (sin(uTime * 1.7 + position.y * 6.0) * 0.02 * (0.5 + uActivity));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      uniform float uActivity;
      uniform vec3 uColor;
      void main() {
        float fresnel = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.4);
        float alpha = 0.18 + fresnel * (0.5 + uActivity * 0.6);
        gl_FragColor = vec4(uColor, alpha);
      }
    `
  });

const setMaterialColor = (material, color, opacity = material.opacity ?? 1) => {
  material.color?.set(color);
  material.emissive?.set?.(color);
  material.opacity = opacity;
};

const disposeObject = (object) => {
  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose());
    } else if (child.material) {
      child.material.dispose();
    }
  });
};

export class HologramEngine {
  constructor({ container, overlayLayer }) {
    this.container = container;
    this.overlayLayer = overlayLayer;
    this.snapshot = null;
    this.projectObjects = new Map();
    this.agentObjects = new Map();
    this.bugObjects = new Map();
    this.effectObjects = new Map();
    this.projectOverlays = new Map();
    this.glowTexture = createGlowTexture();

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x020812, 36, 82);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.camera.position.set(0, 16, 34);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x01070d, 0);
    this.container.append(this.renderer.domElement);

    this.coreUniformMaterial = createFresnelMaterial("#66ecff");
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);

    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);
    this.projectGroup = new THREE.Group();
    this.agentGroup = new THREE.Group();
    this.bugGroup = new THREE.Group();
    this.effectGroup = new THREE.Group();
    this.rootGroup.add(this.projectGroup, this.agentGroup, this.bugGroup, this.effectGroup);

    this.createLights();
    this.createFloor();
    this.createBackgroundParticles();
    this.createCore();
    this.resize();
  }

  createLights() {
    const ambient = new THREE.AmbientLight(0x66d9ff, 0.5);
    const hemisphere = new THREE.HemisphereLight(0x60deff, 0x031019, 0.7);
    const key = new THREE.PointLight(0x66ecff, 10, 90, 2);
    key.position.set(0, 12, 0);
    this.scene.add(ambient, hemisphere, key);
  }

  createFloor() {
    const grid = new THREE.GridHelper(90, 50, 0x4de8ff, 0x12475a);
    grid.material.transparent = true;
    grid.material.opacity = 0.22;
    grid.position.y = -0.3;
    this.rootGroup.add(grid);
    this.floorGrid = grid;

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x45daff,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });

    this.floorRings = [];
    for (const radius of [10, 18, 26, 34]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.08, radius + 0.08, 96), ringMaterial.clone());
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.2;
      ring.userData.radius = radius;
      this.rootGroup.add(ring);
      this.floorRings.push(ring);
    }

    this.centralBeam = this.createBeamColumn("#66ecff", 12, 1.4, 0.14);
    this.centralBeam.position.set(0, 5.8, 0);
    this.rootGroup.add(this.centralBeam);
  }

  createBackgroundParticles() {
    const count = 320;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = (Math.random() - 0.5) * 84;
      positions[index * 3 + 1] = Math.random() * 34 + 2;
      positions[index * 3 + 2] = (Math.random() - 0.5) * 84;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x67dfff,
      size: 0.12,
      transparent: true,
      opacity: 0.55,
      map: this.glowTexture,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.particleField = new THREE.Points(geometry, material);
    this.scene.add(this.particleField);
  }

  createCore() {
    this.coreGroup = new THREE.Group();
    this.coreGroup.position.set(0, 3.2, 0);
    this.rootGroup.add(this.coreGroup);

    const innerSphere = new THREE.Mesh(new THREE.SphereGeometry(1.55, 48, 48), this.coreUniformMaterial);
    const shellMaterial = new THREE.MeshBasicMaterial({
      color: 0x6cecff,
      transparent: true,
      opacity: 0.16,
      wireframe: true,
      blending: THREE.AdditiveBlending
    });
    const shellOne = new THREE.Mesh(new THREE.SphereGeometry(2.35, 28, 28), shellMaterial.clone());
    const shellTwo = new THREE.Mesh(new THREE.SphereGeometry(3.05, 20, 20), shellMaterial.clone());
    shellTwo.material.opacity = 0.1;

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x7ceaff,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending
    });
    const ringOne = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.05, 12, 120), ringMaterial.clone());
    const ringTwo = new THREE.Mesh(new THREE.TorusGeometry(5.8, 0.05, 12, 120), ringMaterial.clone());
    ringTwo.rotation.x = Math.PI / 2;
    ringOne.rotation.y = Math.PI / 4;

    const pulse = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 2.9, 96),
      new THREE.MeshBasicMaterial({
        color: 0x8cf0ff,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      })
    );
    pulse.rotation.x = -Math.PI / 2;
    pulse.position.y = -2.8;

    this.coreGroup.add(innerSphere, shellOne, shellTwo, ringOne, ringTwo, pulse);
    this.coreMeshes = {
      innerSphere,
      shellOne,
      shellTwo,
      ringOne,
      ringTwo,
      pulse
    };
  }

  createBeamColumn(color, height, radius, opacity) {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.35, height, 16, 1, true), material);
    return beam;
  }

  createProjectVisual(project) {
    const group = new THREE.Group();
    const color = project.color;

    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 24, 24),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
      })
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.05, 12, 72),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending
      })
    );
    ring.rotation.x = Math.PI / 2;

    const beam = this.createBeamColumn(color, 8.5, 0.28, 0.08);
    beam.position.y = 4.2;

    const linkGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0)
    ]);
    const link = new THREE.Line(
      linkGeometry,
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.24
      })
    );
    this.rootGroup.add(link);

    group.add(orb, ring, beam);
    this.projectGroup.add(group);

    return { group, orb, ring, beam, link };
  }

  ensureProjectOverlay(project) {
    if (this.projectOverlays.has(project.id)) {
      return this.projectOverlays.get(project.id);
    }

    const panel = document.createElement("div");
    panel.className = "project-overlay";

    const title = document.createElement("div");
    title.className = "project-name";

    const meta = document.createElement("div");
    meta.className = "project-meta";

    panel.append(title, meta);
    this.overlayLayer.append(panel);

    const overlay = { panel, title, meta };
    this.projectOverlays.set(project.id, overlay);
    return overlay;
  }

  createAgentMesh(agent) {
    const color = ROLE_COLORS[agent.role] ?? "#66ecff";
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 20, 20),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending
      })
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.52, 0.04, 10, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending
      })
    );
    ring.rotation.x = Math.PI / 2;

    const wingGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.7, 0, 0),
      new THREE.Vector3(0.7, 0, 0),
      new THREE.Vector3(0, -0.1, -0.55),
      new THREE.Vector3(0, 0.1, 0.55)
    ]);
    const wings = new THREE.LineSegments(
      wingGeometry,
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.6
      })
    );

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    glow.scale.setScalar(1.8);

    const trailA = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    trailA.scale.set(1.8, 1.8, 1.8);
    trailA.position.set(0, -0.04, -0.85);

    const trailB = trailA.clone();
    trailB.material = trailA.material.clone();
    trailB.scale.set(1.25, 1.25, 1.25);
    trailB.position.set(0, -0.04, -1.25);

    group.add(body, ring, wings, glow, trailA, trailB);
    this.agentGroup.add(group);
    return { group, ring, glow, trailA, trailB };
  }

  createBugMesh(bug) {
    const color = BUG_COLORS[bug.kind] ?? "#ff6687";
    const geometry = bug.boss
      ? new THREE.IcosahedronGeometry(1.1, 1)
      : new THREE.IcosahedronGeometry(0.62, 0);
    const body = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        transparent: true,
        opacity: bug.boss ? 0.95 : 0.75
      })
    );
    const group = new THREE.Group();
    group.add(body);

    if (bug.boss) {
      const aura = new THREE.Mesh(
        new THREE.TorusGeometry(1.7, 0.06, 10, 48),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.34,
          blending: THREE.AdditiveBlending
        })
      );
      aura.rotation.x = Math.PI / 2;
      group.add(aura);
      group.userData.aura = aura;
    }

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color,
        transparent: true,
        opacity: bug.boss ? 0.45 : 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    glow.scale.setScalar(bug.boss ? 4.8 : 2.3);
    group.add(glow);
    this.bugGroup.add(group);
    return { group, body, glow };
  }

  createEffectVisual(effect) {
    let object = null;

    if (effect.kind === "beam") {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3()
      ]);
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color: effect.color,
          transparent: true,
          opacity: 0.7,
          blending: THREE.AdditiveBlending
        })
      );
      this.effectGroup.add(line);
      object = { object: line, kind: "beam" };
    } else if (effectUsesRing.has(effect.kind)) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1, 1.08, 64),
        new THREE.MeshBasicMaterial({
          color: effect.color,
          transparent: true,
          opacity: 0.34,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending
        })
      );
      ring.rotation.x = -Math.PI / 2;
      this.effectGroup.add(ring);
      object = { object: ring, kind: "ring" };
    } else if (effectUsesSprite.has(effect.kind)) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTexture,
          color: effect.color,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      this.effectGroup.add(sprite);
      object = { object: sprite, kind: "sprite" };
    } else {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTexture,
          color: effect.color,
          transparent: true,
          opacity: 0.45,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      this.effectGroup.add(sprite);
      object = { object: sprite, kind: "sprite" };
    }

    return object;
  }

  syncProjects(projects = []) {
    const seen = new Set();

    for (const project of projects) {
      seen.add(project.id);
      let visuals = this.projectObjects.get(project.id);
      if (!visuals) {
        visuals = this.createProjectVisual(project);
        this.projectObjects.set(project.id, visuals);
      }

      visuals.group.position.set(project.position.x, project.position.y, project.position.z);
      visuals.link.geometry.setFromPoints([
        new THREE.Vector3(0, this.snapshot?.core?.position?.y ?? 3.2, 0),
        new THREE.Vector3(project.position.x, project.position.y, project.position.z)
      ]);
      const opacity = project.status === "offline" ? 0.08 : 0.18 + project.activityLevel * 0.42;
      setMaterialColor(visuals.orb.material, project.color, project.status === "offline" ? 0.24 : 0.7);
      setMaterialColor(visuals.ring.material, project.color, opacity);
      setMaterialColor(visuals.beam.material, project.color, project.status === "offline" ? 0.04 : 0.08 + project.activityLevel * 0.16);
      visuals.ring.scale.setScalar(1 + project.activityLevel * 0.35);
      visuals.link.material.color.set(project.color);
      visuals.link.material.opacity = opacity;

      const overlay = this.ensureProjectOverlay(project);
      overlay.title.textContent = project.name;
      overlay.meta.textContent = `${project.status.toUpperCase()} · ${project.activeAgents} drones · ${project.activeBugs} bugs`;
      overlay.panel.classList.toggle("offline", project.status === "offline");
      overlay.panel.style.borderColor = `${project.color}55`;
    }

    for (const [projectId, visuals] of this.projectObjects.entries()) {
      if (!seen.has(projectId)) {
        visuals.link.parent?.remove(visuals.link);
        visuals.group.parent?.remove(visuals.group);
        disposeObject(visuals.group);
        visuals.link.geometry.dispose();
        visuals.link.material.dispose();
        this.projectObjects.delete(projectId);
      }
    }
  }

  syncAgents(agents = []) {
    const seen = new Set();

    for (const agent of agents) {
      seen.add(agent.id);
      let visual = this.agentObjects.get(agent.id);
      if (!visual) {
        visual = this.createAgentMesh(agent);
        this.agentObjects.set(agent.id, visual);
      }

      visual.group.userData.targetPosition = new THREE.Vector3(
        agent.position.x,
        agent.position.y,
        agent.position.z
      );
      visual.group.userData.agent = agent;
      visual.group.scale.setScalar(0.8 + agent.size * 0.34);
      setMaterialColor(visual.glow.material, ROLE_COLORS[agent.role] ?? "#66ecff", 0.36 + agent.hitFlash * 0.3);
    }

    for (const [agentId, visual] of this.agentObjects.entries()) {
      if (!seen.has(agentId)) {
        visual.group.parent?.remove(visual.group);
        disposeObject(visual.group);
        this.agentObjects.delete(agentId);
      }
    }
  }

  syncBugs(bugs = []) {
    const seen = new Set();

    for (const bug of bugs) {
      seen.add(bug.id);
      let visual = this.bugObjects.get(bug.id);
      if (!visual) {
        visual = this.createBugMesh(bug);
        this.bugObjects.set(bug.id, visual);
      }

      visual.group.userData.targetPosition = new THREE.Vector3(bug.position.x, bug.position.y, bug.position.z);
      visual.group.userData.bug = bug;
      visual.group.scale.setScalar(0.75 + bug.size * 0.28);
      setMaterialColor(visual.body.material, BUG_COLORS[bug.kind] ?? "#ff6687", bug.boss ? 0.95 : 0.74);
      setMaterialColor(visual.glow.material, BUG_COLORS[bug.kind] ?? "#ff6687", bug.boss ? 0.42 : 0.2);
    }

    for (const [bugId, visual] of this.bugObjects.entries()) {
      if (!seen.has(bugId)) {
        visual.group.parent?.remove(visual.group);
        disposeObject(visual.group);
        this.bugObjects.delete(bugId);
      }
    }
  }

  syncEffects(effects = []) {
    const seen = new Set();

    for (const effect of effects) {
      seen.add(effect.id);
      let visual = this.effectObjects.get(effect.id);
      if (!visual) {
        visual = this.createEffectVisual(effect);
        this.effectObjects.set(effect.id, visual);
      }
      visual.effect = effect;
    }

    for (const [effectId, visual] of this.effectObjects.entries()) {
      if (!seen.has(effectId)) {
        visual.object.parent?.remove(visual.object);
        disposeObject(visual.object);
        this.effectObjects.delete(effectId);
      }
    }
  }

  setSnapshot(snapshot) {
    this.snapshot = snapshot;
    this.syncProjects(snapshot?.projects ?? []);
    this.syncAgents(snapshot?.agents ?? []);
    this.syncBugs(snapshot?.bugs ?? []);
    this.syncEffects(snapshot?.effects ?? []);
  }

  resize() {
    const width = this.container.clientWidth || 960;
    const height = this.container.clientHeight || 660;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  worldToScreen(position) {
    const projected = new THREE.Vector3(position.x, position.y + 2.1, position.z);
    projected.project(this.camera);
    return {
      x: ((projected.x + 1) / 2) * this.container.clientWidth,
      y: ((-projected.y + 1) / 2) * this.container.clientHeight,
      visible: projected.z < 1
    };
  }

  updateProjectOverlays() {
    if (!this.snapshot) {
      return;
    }

    for (const project of this.snapshot.projects ?? []) {
      const overlay = this.projectOverlays.get(project.id);
      if (!overlay) {
        continue;
      }
      const screen = this.worldToScreen(project.position);
      overlay.panel.style.opacity = screen.visible ? "1" : "0";
      overlay.panel.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, -50%)`;
    }
  }

  animateCore(time) {
    if (!this.snapshot) {
      return;
    }

    const activity = this.snapshot.core?.activityLevel ?? 0.15;
    this.coreUniformMaterial.uniforms.uTime.value = time * 0.001;
    this.coreUniformMaterial.uniforms.uActivity.value = activity;
    this.coreMeshes.shellOne.rotation.y += 0.0035 + activity * 0.008;
    this.coreMeshes.shellTwo.rotation.x -= 0.0025 + activity * 0.006;
    this.coreMeshes.ringOne.rotation.z += 0.003 + activity * 0.01;
    this.coreMeshes.ringTwo.rotation.y -= 0.002 + activity * 0.007;
    const pulseScale = 1 + activity * 0.6 + Math.sin(time * 0.0035) * 0.06;
    this.coreMeshes.pulse.scale.setScalar(pulseScale);
    this.coreMeshes.pulse.material.opacity = 0.14 + activity * 0.2;
    this.centralBeam.material.opacity = 0.08 + activity * 0.12;
  }

  animateProjects(time) {
    for (const visuals of this.projectObjects.values()) {
      visuals.ring.rotation.z += 0.008;
      visuals.beam.material.opacity = Math.max(0.04, visuals.beam.material.opacity + Math.sin(time * 0.002) * 0.002);
    }
  }

  animateAgents(time) {
    for (const visual of this.agentObjects.values()) {
      const target = visual.group.userData.targetPosition;
      const agent = visual.group.userData.agent;
      if (!target || !agent) {
        continue;
      }
      visual.group.position.lerp(target, 0.22);
      visual.group.rotation.y += 0.08;
      visual.ring.rotation.z += 0.12;
      visual.glow.material.opacity = 0.26 + Math.sin(time * 0.01 + agent.position.x) * 0.12 + agent.hitFlash * 0.4;
      const trailBoost = agent.state === "move" || agent.launching ? 0.24 : 0.08;
      visual.trailA.material.opacity = trailBoost + Math.sin(time * 0.012 + agent.position.z) * 0.04;
      visual.trailB.material.opacity = trailBoost * 0.75 + Math.cos(time * 0.01 + agent.position.x) * 0.03;
    }
  }

  animateBugs(time) {
    for (const visual of this.bugObjects.values()) {
      const target = visual.group.userData.targetPosition;
      const bug = visual.group.userData.bug;
      if (!target || !bug) {
        continue;
      }
      visual.group.position.lerp(target, 0.18);
      visual.group.rotation.y += bug.boss ? 0.03 : 0.05;
      visual.group.rotation.x = Math.sin(time * 0.003 + bug.position.x) * 0.1;
      if (visual.group.userData.aura) {
        visual.group.userData.aura.rotation.z += 0.035;
      }
    }
  }

  animateEffects() {
    for (const visual of this.effectObjects.values()) {
      const effect = visual.effect;
      const life = effect.maxTtl ? effect.ttl / effect.maxTtl : 1;
      if (visual.kind === "beam") {
        const from = effect.from ?? { x: 0, y: 0, z: 0 };
        const to = effect.to ?? { x: 0, y: 0, z: 0 };
        visual.object.geometry.setFromPoints([
          new THREE.Vector3(from.x, from.y, from.z),
          new THREE.Vector3(to.x, to.y, to.z)
        ]);
        visual.object.material.opacity = 0.2 + life * 0.7;
      } else if (visual.kind === "ring") {
        const pos = effect.position ?? { x: 0, y: 0, z: 0 };
        visual.object.position.set(pos.x, pos.y, pos.z);
        visual.object.scale.setScalar((effect.radius ?? 2) * (2 - life));
        visual.object.material.opacity = 0.12 + life * 0.28;
      } else {
        const pos = effect.position ?? { x: 0, y: 0, z: 0 };
        visual.object.position.set(pos.x, pos.y, pos.z);
        visual.object.scale.setScalar((effect.radius ?? 1.5) * (1.2 + (1 - life)));
        visual.object.material.opacity = 0.1 + life * 0.45;
      }
    }
  }

  render(time) {
    const t = time * 0.001;
    this.camera.position.x = Math.sin(t * 0.18) * 34;
    this.camera.position.z = Math.cos(t * 0.18) * 34;
    this.camera.position.y = 15 + Math.sin(t * 0.27) * 1.5;
    this.camera.lookAt(0, 3.2, 0);

    this.floorGrid.rotation.y += 0.0008;
    this.floorRings.forEach((ring, index) => {
      ring.rotation.z += 0.0008 * (index + 1);
      ring.material.opacity = 0.08 + Math.sin(t * 0.7 + index) * 0.03;
    });
    this.particleField.rotation.y += 0.0006;

    this.animateCore(time);
    this.animateProjects(time);
    this.animateAgents(time);
    this.animateBugs(time);
    this.animateEffects();
    this.updateProjectOverlays();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.projectObjects.forEach((visuals) => {
      visuals.group.parent?.remove(visuals.group);
      visuals.link.parent?.remove(visuals.link);
      disposeObject(visuals.group);
      visuals.link.geometry.dispose();
      visuals.link.material.dispose();
    });
    this.agentObjects.forEach((visual) => {
      visual.group.parent?.remove(visual.group);
      disposeObject(visual.group);
    });
    this.bugObjects.forEach((visual) => {
      visual.group.parent?.remove(visual.group);
      disposeObject(visual.group);
    });
    this.effectObjects.forEach((visual) => {
      visual.object.parent?.remove(visual.object);
      disposeObject(visual.object);
    });
    this.renderer.dispose();
  }
}

export default HologramEngine;

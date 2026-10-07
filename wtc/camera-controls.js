// A flying camera: looking around never changes the camera's position.
// No scene centre or orbit radius is involved in navigation.
export class FreeCameraControls {
  constructor(camera) {
    this.camera = camera;
    this.speed = 100;
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    camera.rotation.order = 'YXZ';
    this.adoptOrientation();
  }
  adoptOrientation() {
    this.camera.rotation.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = this.camera.rotation.y;
    this.pitch = this.camera.rotation.x;
    this.roll = this.camera.rotation.z;
  }
  pose(position, lookAt, speed = this.speed) {
    this.camera.position.set(...position);
    this.camera.lookAt(...lookAt);
    this.adoptOrientation();
    this.speed = speed;
    this.camera.updateMatrixWorld();
  }
  look(dx, dy) {
    this.yaw -= dx * .003;
    this.pitch = Math.max(-Math.PI / 2 + .015, Math.min(Math.PI / 2 - .015, this.pitch - dy * .003));
    this.camera.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.camera.updateMatrixWorld();
  }
  pan(dx, dy) {
    const scale = this.speed * .006 * this.camera.fov / 45;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.camera.position.x += (-dx * c + dy * s * sp) * scale;
    this.camera.position.y += dy * cp * scale;
    this.camera.position.z += (dx * s + dy * c * sp) * scale;
    this.camera.updateMatrixWorld();
  }
  move(keys, elapsed) {
    const f = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
    const r = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    const vertical = Number(keys.has('KeyE')) - Number(keys.has('KeyQ'));
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const x = -s * f + c * r, y = vertical, z = -c * f - s * r;
    const length = Math.hypot(x, y, z);
    if (!length) return false;
    const speedScale = sprint ? 4 : .7;
    const amount = this.speed * elapsed * speedScale / length;
    this.camera.position.x += x * amount;
    this.camera.position.y += y * amount;
    this.camera.position.z += z * amount;
    this.camera.updateMatrixWorld();
    return true;
  }
  zoom(delta) {
    this.camera.fov = Math.max(10, Math.min(100, this.camera.fov * Math.exp(delta * .001)));
    this.camera.updateProjectionMatrix();
    return this.camera.fov;
  }
}

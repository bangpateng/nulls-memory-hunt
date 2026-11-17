// One shared input state, written by the keyboard and by the on-screen touch controls.
export const input = {
  mx: 0, // -1 left .. 1 right
  mz: 0, // -1 back .. 1 forward
  jumpHeld: false,
  jumpPressed: false,
  actionPressed: false,
  carPressed: false,
  brakeHeld: false,
  camDX: 0, // camera drag in px since the last frame
  camDY: 0,
  hornPressed: false,
  lastDrag: 0,
};
const keys = new Set<string>();
let attached = false;

function axes() {
  const k = (...c: string[]) => c.some((x) => keys.has(x));
  input.mx = (k("KeyD", "ArrowRight") ? 1 : 0) - (k("KeyA", "ArrowLeft") ? 1 : 0);
  input.mz = (k("KeyW", "ArrowUp") ? 1 : 0) - (k("KeyS", "ArrowDown") ? 1 : 0);
}

export function attachKeyboard() {
  if (attached) return;
  attached = true;
  window.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === "Space" || e.code === "KeyK") {
      input.jumpPressed = true;
      input.jumpHeld = true;
    }
    if (e.code === "KeyE" || e.code === "KeyJ" || e.code === "ShiftLeft" || e.code === "Enter") input.actionPressed = true;
    if (e.code === "KeyF" || e.code === "KeyL") input.carPressed = true;
    if (e.code === "KeyH") input.hornPressed = true;
    axes();
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.code);
    if (e.code === "Space" || e.code === "KeyK") input.jumpHeld = false;
    axes();
  });
  window.addEventListener("blur", () => {
    keys.clear();
    input.jumpHeld = false;
    axes();
  });
  // drag anywhere on the canvas (mouse) to turn the camera
  let dragging = false,
    lx = 0,
    ly = 0;
  window.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || (e.target as HTMLElement).tagName !== "CANVAS") return;
    dragging = true;
    lx = e.clientX;
    ly = e.clientY;
  });
  window.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    input.camDX += e.clientX - lx;
    input.camDY += e.clientY - ly;
    ly = e.clientY;
    input.lastDrag = performance.now();
    lx = e.clientX;
  });
  window.addEventListener("pointerup", () => (dragging = false));
}

export function consume() {
  const j = input.jumpPressed,
    a = input.actionPressed,
    c = input.carPressed,
    d = input.camDX,
    dy = input.camDY,
    h = input.hornPressed;
  input.camDY = 0;
  input.hornPressed = false;
  input.jumpPressed = false;
  input.actionPressed = false;
  input.carPressed = false;
  input.camDX = 0;
  return { jump: j, action: a, car: c, camDX: d, camDY: dy, horn: h };
}

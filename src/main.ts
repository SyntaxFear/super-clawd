import './style.css';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const g = canvas.getContext('2d')!;

function frame(): void {
  g.fillStyle = '#f1dcc5';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#d97757';
  g.fillRect(152, 106, 16, 12);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

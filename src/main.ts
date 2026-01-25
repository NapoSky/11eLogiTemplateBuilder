import './styles.css';
import { App } from './App';

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.mount(document.getElementById('app')!);
});

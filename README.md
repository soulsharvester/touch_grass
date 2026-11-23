# Touch Grass

A small, browser-based Three.js game about walking through an endless field and collecting grass blades.

## Play locally

```sh
npm install
npm run dev
```

## Controls

- **WASD / arrow keys**: Move
- **Space**: Jump; landing and movement both harvest grass
- **E**: Enter or leave the car after buying it
- **F**: Fire the grass popper after buying it
- **Escape**: Pause or resume
- **Field shop**: Buy and equip tools with collected blades

The field streams in as you explore, and cleared grass grows back after a short while. Items arrive by drone; walk up to the dropped package to collect your purchase.

## Publish with GitHub Pages

The included GitHub Actions workflow builds and deploys the site whenever code is pushed to `main`. In the repository settings, open **Pages** and set the build source to **GitHub Actions**. The workflow publishes the generated `dist` folder; Vite uses relative asset URLs so the game works at the repository’s Pages URL.

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
- **P**: Switch between first- and third-person views
- **E**: Enter or leave an owned vehicle
- **Left click / F**: Punch or fire an equipped weapon
- **Escape**: Pause or resume
- **Field shop**: Buy and equip tools with collected blades

The field streams in as you explore, and cleared grass tumbles away before growing back. Items arrive by drone; walk up to the dropped package to collect your purchase. The shop includes gloves, snippers, a grass blaster, a rocket launcher, a car, a gunner car, and a tank.

## Publish with GitHub Pages

The included GitHub Actions workflow builds and deploys the site whenever code is pushed to `main`. In the repository settings, open **Pages** and set the build source to **GitHub Actions**. The workflow publishes the generated `dist` folder; Vite uses relative asset URLs so the game works at the repository’s Pages URL.

If the first deployment ran before Pages was enabled, rerun **Deploy to GitHub Pages** from the repository’s **Actions** tab after selecting the GitHub Actions source.

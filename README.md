# RASCA ROGUE 🎰

Simulador de **rascas (raspaditas) 3×3** con estética **roguelike** y un **5% de probabilidad base de JACKPOT**.

Todo el juego es HTML/CSS/JS puro, sin dependencias ni build. Abre `index.html` en el navegador y a jugar.

## Cómo jugar

1. Empiezas una *run* con **60 monedas**.
2. En cada **piso** la tienda ofrece 3 rascas (BRONCE, PLATA, ORO) y una **reliquia**.
3. Compra una rasca y **rasca las 9 casillas** (una a una o con `RASCAR TODO`).
4. Si juntas **3 símbolos iguales** ganas premio; las líneas en raya pagan extra.
5. Hay un **5% de probabilidad** de que la rasca sea **JACKPOT** 🎰 (premio enorme).
6. Pulsa **COBRAR** para sumar el premio.
7. **DESCIENDE** de piso para multiplicar premios... y costes.
8. Si te quedas sin monedas suficientes para comprar una rasca, **la run termina** (permadeath). Tu mejor puntuación se guarda como récord.

El botón **ⓘ** (esquina superior derecha) abre la **tabla de premios**: lo que paga cada figura (3+ iguales), las 8 formas ganadoras (filas, columnas y diagonales) y el jackpot, con las monedas exactas según el piso, el tier y las reliquias activas.

## Elementos roguelike

- **Permadeath:** una sola vida por run; al quebrar, vuelves a empezar.
- **Pisos escalables:** cada piso aumenta el coste de las rascas y el multiplicador de premios (riesgo/recompensa).
- **Reliquias:** mejoras permanentes durante la run que alteran tu suerte:
  - 🍀 Trébol — +4% de probabilidad de jackpot.
  - 🧲 Imán Dorado — +30% a todos los premios.
  - 🔮 Ojo del Destino — 💎 y 7️⃣ valen el doble.
  - ⚖️ Balanza — las rascas cuestan -25%.
  - 👑 Corona — el jackpot paga el doble.
  - 🎯 Marcador — 🍒 y 🍋 cuentan doble.
  - 🪞 Espejo — las líneas en raya pagan +50%.
- **Aleatoriedad:** cada rasca y cada tienda se generan al azar.
- **Récord persistente:** la mejor run se guarda en `localStorage`.

## Ejecutar

```bash
# Opción 1: abre el archivo directamente
xdg-open index.html      # Linux
open index.html          # macOS

# Opción 2: servidor local
python3 -m http.server 8000
# luego visita http://localhost:8000
```

## Archivos

- `index.html` — estructura y pantallas (inicio / juego / game over).
- `style.css` — estética CRT/terminal roguelike.
- `game.js` — toda la lógica: generación de rascas, cálculo de premios, jackpot al 5%, pisos, reliquias y persistencia.

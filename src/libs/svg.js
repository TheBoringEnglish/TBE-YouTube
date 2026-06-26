export const loadingSvg = `<svg viewBox="-20 0 100 100" 
     style="display: inline-block; width: 1em; height: 1em; vertical-align: middle;">
  <circle fill="#209CEE" stroke="none" cx="6" cy="50" r="6">
    <animateTransform attributeName="transform" dur="1s" type="translate" values="0 15 ; 0 -15; 0 15" repeatCount="indefinite" begin="0.1"/>
  </circle>
  <circle fill="#209CEE" stroke="none" cx="30" cy="50" r="6">
    <animateTransform attributeName="transform" dur="1s" type="translate" values="0 10 ; 0 -10; 0 10" repeatCount="indefinite" begin="0.2"/>
  </circle>
  <circle fill="#209CEE" stroke="none" cx="54" cy="50" r="6">
    <animateTransform attributeName="transform" dur="1s" type="translate" values="0 5 ; 0 -5; 0 5" repeatCount="indefinite" begin="0.3"/>
  </circle>
</svg>
`;

function createSVGElement(tag, attributes) {
  const svgNS = "http://www.w3.org/2000/svg";
  const el = document.createElementNS(svgNS, tag);
  for (const key in attributes) {
    el.setAttribute(key, attributes[key]);
  }
  return el;
}

/**
 * 创建loding动画
 * @returns
 */
export function createLoadingSVG() {
  const svg = createSVGElement("svg", {
    viewBox: "-20 0 100 100",
    style:
      "display: inline-block; width: 1em; height: 1em; vertical-align: middle;",
  });

  const circleData = [
    { cx: "6", begin: "0.1", values: "0 15 ; 0 -15; 0 15" },
    { cx: "30", begin: "0.2", values: "0 10 ; 0 -10; 0 10" },
    { cx: "54", begin: "0.3", values: "0 5 ; 0 -5; 0 5" },
  ];

  circleData.forEach((data) => {
    const circle = createSVGElement("circle", {
      fill: "#209CEE",
      stroke: "none",
      cx: data.cx,
      cy: "50",
      r: "6",
    });
    const animation = createSVGElement("animateTransform", {
      attributeName: "transform",
      dur: "1s",
      type: "translate",
      values: data.values,
      repeatCount: "indefinite",
      begin: data.begin,
    });
    circle.appendChild(animation);
    svg.appendChild(circle);
  });

  return svg;
}

/**
 * 创建logo
 * @param {*} param0
 * @returns
 */
export function createLogoSVG({
  width = "24",
  height = "24",
  viewBox = "-5 -5 40 40",
  isSelected = false,
} = {}) {
  const svg = createSVGElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width,
    height,
    viewBox,
    version: "1.1",
  });

  const bgFill = isSelected ? "#fff7ed" : "transparent";

  // 背景容器
  const bg = createSVGElement("rect", {
    x: "0", y: "0", width: "32", height: "32",
    rx: "6", ry: "6",
    fill: bgFill,
  });
  svg.appendChild(bg);

  // 定义渐变定义
  const defs = createSVGElement("defs");
  const linearGradient = createSVGElement("linearGradient", {
    id: "tbeLogoGrad",
    x1: "0%", y1: "0%", x2: "100%", y2: "100%"
  });
  const stop1 = createSVGElement("stop", { offset: "0%", "stop-color": "#f97316" });
  const stop2 = createSVGElement("stop", { offset: "100%", "stop-color": "#d94600" });
  linearGradient.appendChild(stop1);
  linearGradient.appendChild(stop2);
  defs.appendChild(linearGradient);
  svg.appendChild(defs);

  // 10度倾斜组，以 16, 16 为中心点旋转 (SVG transform rotate(-10, 16, 16) 代表逆时针旋转 10 度)
  const g = createSVGElement("g", {
    transform: "rotate(-10, 16, 16)"
  });

  // 橙色方块 24x24
  const rect = createSVGElement("rect", {
    x: "4", y: "4", width: "24", height: "24",
    rx: "6.5", ry: "6.5",
    fill: "url(#tbeLogoGrad)",
  });

  // TBE 大写字样
  const text = createSVGElement("text", {
    x: "16",
    y: "17",
    "font-family": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "font-size": "8",
    "font-weight": "800",
    fill: "#ffffff",
    "text-anchor": "middle",
    "dominant-baseline": "middle"
  });
  text.textContent = "TBE";

  g.appendChild(rect);
  g.appendChild(text);
  svg.appendChild(g);

  return svg;
}

export function createSettingsSVG({ width = "18", height = "18" } = {}) {
  const svg = createSVGElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width,
    height,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  });

  const circle = createSVGElement("circle", { cx: "12", cy: "12", r: "3" });
  const path = createSVGElement("path", {
    d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z",
  });

  svg.appendChild(circle);
  svg.appendChild(path);
  return svg;
}

export function createImportSVG({
  width = "18",
  height = "18",
  color = "currentColor",
} = {}) {
  const svg = createSVGElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width,
    height,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    "stroke-width": "2.2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  });

  const path1 = createSVGElement("path", {
    d: "M12 17V3m0 0L8 7m4-4l4 4"
  });
  const path2 = createSVGElement("path", {
    d: "M20 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2"
  });

  svg.appendChild(path1);
  svg.appendChild(path2);
  return svg;
}


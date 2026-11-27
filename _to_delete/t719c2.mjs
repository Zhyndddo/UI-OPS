import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const { default: Page } = await import("./t719b.out.mjs");
const h = renderToStaticMarkup(React.createElement(Page));
console.log(h.length, h.includes("Tính phí nhạc nền"), h.includes("Chưa có dòng nào"));

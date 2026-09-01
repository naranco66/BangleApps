{ // own scope, so unloading the clock takes everything with it
let drawTimeout;

let draw = function() {
  let r = Bangle.appRect; // free area - excludes the widget bar
  let locale = require("locale");
  let d = new Date();
  let cx = r.x + r.w/2;

  g.reset().clearRect(r); // repaint our area only, leave the widgets alone

  // large centred time
  g.setFontAlign(0,0).setFont("Vector",52);
  g.drawString(locale.time(d,1), cx, r.y + r.h*0.40);

  // date below it - drop the weekday if this locale makes the line too wide
  g.setFont("Vector",20);
  let dateStr = locale.dow(d,1).toUpperCase()+" "+locale.date(d,1);
  if (g.stringWidth(dateStr) > r.w) dateStr = locale.date(d,1);
  g.drawString(dateStr, cx, r.y + r.h*0.72);

  // redraw as the minute rolls over
  if (drawTimeout) clearTimeout(drawTimeout);
  drawTimeout = setTimeout(function() {
    drawTimeout = undefined;
    draw();
  }, 60000 - (Date.now() % 60000));
};

g.clear();

Bangle.setUI({
  mode : "clock",
  remove : function() { // fast load - drop the timer when we're unloaded
    if (drawTimeout) clearTimeout(drawTimeout);
    drawTimeout = undefined;
  },
  redraw : draw,
});

Bangle.loadWidgets();
draw(); // after loadWidgets, so Bangle.appRect already excludes the widget bar
Bangle.drawWidgets();
}

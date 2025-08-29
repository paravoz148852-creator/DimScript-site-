const vars = {};
const elementsByName = {};
const images = {};
const timers = {};
const signals = {};
let ifStack = [];
let loopStack = [];
let signalStack = [];
let fingerMoveStack = [];
let lastMousePosition = { x: 0, y: 0 };
let touchElements = {};
let lastTouchPosition = { x: 0, y: 0 };

document.addEventListener('mousemove', (e) => {
  lastMousePosition = { x: e.clientX, y: e.clientY };
  
  for (const fingerMove of fingerMoveStack) {
    const element = elementsByName[fingerMove.target];
    if (!element) continue;
    
    const rect = element.getBoundingClientRect();
    const elementCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
    
    const distance = Math.sqrt(
      Math.pow(lastMousePosition.x - elementCenter.x, 2) + 
      Math.pow(lastMousePosition.y - elementCenter.y, 2)
    );
    
    fingerMove.isMoving = distance > fingerMove.lastDistance;
    fingerMove.lastDistance = distance;
  }
});

document.addEventListener('touchstart', handleTouch);
document.addEventListener('touchmove', handleTouch);
document.addEventListener('touchend', handleTouchEnd);

function handleTouch(e) {
  e.preventDefault();
  if (e.touches.length > 0) {
    const touch = e.touches[0];
    lastTouchPosition = { x: touch.clientX, y: touch.clientY };
    
    for (const elementName in touchElements) {
      const element = elementsByName[elementName];
      if (element) {
        const rect = element.getBoundingClientRect();
        const isTouching = (
          lastTouchPosition.x >= rect.left &&
          lastTouchPosition.x <= rect.right &&
          lastTouchPosition.y >= rect.top &&
          lastTouchPosition.y <= rect.bottom
        );
        
        if (isTouching && !touchElements[elementName].isTouching) {
          touchElements[elementName].isTouching = true;
          touchElements[elementName].startIndex = touchElements[elementName].currentIndex;
        } else if (!isTouching && touchElements[elementName].isTouching) {
          touchElements[elementName].isTouching = false;
        }
      }
    }
  }
}

function handleTouchEnd(e) {
  for (const elementName in touchElements) {
    touchElements[elementName].isTouching = false;
  }
}

function resolveVars(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/\$[a-zA-Z_]\w*/g, match => {
    const name = match.slice(1);
    return vars[name] ?? match;
  }) || "";
}

function evaluateExpression(expr) {
  try {
    expr = resolveVars(expr);
    expr = expr.replace(/\b(and)\b/gi, '&&')
               .replace(/\b(or)\b/gi, '||')
               .replace(/\b(not)\b/gi, '!');
    expr = expr.replace(/(\w+)\s*==\s*"([^"]*)"/g, '$1 === "$2"')
               .replace(/(\w+)\s*!=\s*"([^"]*)"/g, '$1 !== "$2"');
    return new Function(`return ${expr}`)();
  } catch (e) {
    console.error("Ошибка вычисления выражения:", expr, e);
    return false;
  }
}

function showImageManager() {
  document.getElementById('imageManager').style.display = 'block';
  updateImageGallery();
}

function hideImageManager() {
  document.getElementById('imageManager').style.display = 'none';
}

function updateImageGallery() {
  const gallery = document.getElementById('imageGallery');
  gallery.innerHTML = '';
  
  Object.keys(images).forEach(name => {
    const container = document.createElement('div');
    container.className = 'image-container';
    
    const img = document.createElement('img');
    img.src = images[name];
    img.className = 'image-thumbnail';
    img.title = name;
    img.onclick = () => selectImage(name);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'image-delete-btn';
    deleteBtn.innerHTML = '×';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      delete images[name];
      updateImageGallery();
    };
    
    const nameLabel = document.createElement('div');
    nameLabel.textContent = name;
    nameLabel.style.color = '#00ff88';
    nameLabel.style.textAlign = 'center';
    
    container.appendChild(img);
    container.appendChild(deleteBtn);
    container.appendChild(nameLabel);
    gallery.appendChild(container);
  });
}

function selectImage(name) {
  hideImageManager();
  document.getElementById('code').value += `\nimage "${name}" 0 0`;
}

document.getElementById('imageUpload').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const name = prompt('Введите имя для картинки:', file.name.split('.')[0]);
    if (name) {
      images[name] = e.target.result;
      updateImageGallery();
    }
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});

function exportProject() {
  const project = {
    code: document.getElementById('code').value,
    images: images
  };
  
  const data = JSON.stringify(project);
  const blob = new Blob([data], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `dimscript_project_${new Date().toISOString().slice(0, 10)}.dimscript`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.getElementById('fileInput').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const project = JSON.parse(e.target.result);
      
      document.getElementById('code').value = '';
      for (const key in images) {
        delete images[key];
      }
      
      document.getElementById('code').value = project.code;
      for (const key in project.images) {
        images[key] = project.images[key];
      }
      
      alert('Проект успешно загружен!');
    } catch (error) {
      alert('Ошибка при загрузке проекта: ' + error.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

async function runCode() {
  document.getElementById("editor").style.display = "none";
  document.getElementById("backBtn").style.display = "inline-block";
  const code = document.getElementById("code").value.trim().split("\n");
  const output = document.getElementById("output");
  output.innerHTML = "";

  for (const id in timers) {
    clearTimeout(timers[id]);
    delete timers[id];
  }

  let i = 0;
  loopStack = [];
  ifStack = [];
  signalStack = [];
  fingerMoveStack = [];
  
  while (i < code.length) {
    let line = code[i].trim();
    if (line === "" || line.startsWith("//")) {
      i++;
      continue;
    }

    const parts = line.split(" ");
    const cmd = parts[0];
    const args = parts.slice(1);
    const rest = args.join(" ");

    if (ifStack.length > 0 && ifStack[ifStack.length - 1].skip) {
      if (cmd === "else" && ifStack[ifStack.length - 1].hasElse === false) {
        ifStack[ifStack.length - 1].skip = false;
        ifStack[ifStack.length - 1].hasElse = true;
      } 
      else if (cmd === "endif") {
        ifStack.pop();
      }
      i++;
      continue;
    }

    if (cmd === "signal") {
      const signalName = resolveVars(args[0]);
      signals[signalName] = true;
      
      if (signalStack.length > 0 && signalStack[signalStack.length - 1].name === signalName) {
        signalStack[signalStack.length - 1].received = true;
      }
      i++;
      continue;
    }

    if (cmd === "signal2") {
      const signalName = resolveVars(args[0]);
      signalStack.push({
        name: signalName,
        received: signals[signalName] || false,
        startIndex: i
      });
      
      if (!signals[signalName]) {
        i++;
        continue;
      }
      i++;
      continue;
    }

    if (cmd === "end") {
      if (signalStack.length > 0 && signalStack[signalStack.length - 1].received) {
        signalStack.pop();
        i++;
        continue;
      }
      
      if (fingerMoveStack.length > 0) {
        const fingerMove = fingerMoveStack[fingerMoveStack.length - 1];
        if (fingerMove.isMoving) {
          i = fingerMove.startIndex;
        } else {
          fingerMoveStack.pop();
        }
        continue;
      }
      
      if (loopStack.length > 0) {
        const loop = loopStack[loopStack.length - 1];
        
        if (loop.type === "for") {
          vars[loop.counterVar] = vars[loop.counterVar] + 1;
          
          if (vars[loop.counterVar] <= loop.endValue) {
            i = loop.startIndex;
          } else {
            loopStack.pop();
          }
          continue;
        }
        else if (loop.type === "forever") {
          i = loop.startIndex;
          continue;
        }
        else if (loop.type === "while") {
          const condition = evaluateExpression(loop.condition);
          if (condition) {
            i = loop.startIndex;
          } else {
            loopStack.pop();
          }
          continue;
        }
      }
      
      output.innerHTML += `<div>❗ Ошибка: нет открытого цикла или сигнала для команды 'end'</div>`;
      i++;
      continue;
    }

    if (cmd === "if") {
      const condition = evaluateExpression(rest);
      ifStack.push({
        condition: condition,
        skip: !condition,
        hasElse: false
      });
      i++;
      continue;
    }

    if (cmd === "else") {
      if (ifStack.length === 0) {
        output.innerHTML += `<div>❗ Ошибка: 'else' без соответствующего 'if'</div>`;
        i++;
        continue;
      }
      ifStack[ifStack.length - 1].skip = ifStack[ifStack.length - 1].condition;
      ifStack[ifStack.length - 1].hasElse = true;
      i++;
      continue;
    }

    if (cmd === "endif") {
      if (ifStack.length === 0) {
        output.innerHTML += `<div>❗ Ошибка: 'endif' без соответствующего 'if'</div>`;
        i++;
        continue;
      }
      ifStack.pop();
      i++;
      continue;
    }

    if (cmd === "for") {
      if (args.length < 4) {
        output.innerHTML += `<div>❗ Ошибка: синтаксис команды for неправильный (нужно: for имя_переменной от до)</div>`;
        i++;
        continue;
      }
      
      const counterVar = resolveVars(args[0]);
      const startValue = parseInt(resolveVars(args[1]));
      const endValue = parseInt(resolveVars(args[2]));
      
      vars[counterVar] = startValue;
      
      loopStack.push({
        type: "for",
        counterVar: counterVar,
        startValue: startValue,
        endValue: endValue,
        startIndex: i
      });
      i++;
      continue;
    }

    if (cmd === "forever") {
      loopStack.push({
        type: "forever",
        startIndex: i
      });
      i++;
      continue;
    }

    if (cmd === "while") {
      const condition = evaluateExpression(rest);
      if (condition) {
        loopStack.push({
          type: "while",
          startIndex: i,
          condition: rest
        });
      } else {
        let depth = 1;
        while (i < code.length && depth > 0) {
          i++;
          const nextCmd = code[i]?.trim().split(" ")[0];
          if (nextCmd === "while" || nextCmd === "for" || nextCmd === "forever" || nextCmd === "signal2") depth++;
          if (nextCmd === "end") depth--;
        }
      }
      i++;
      continue;
    }

    if (cmd === "while" && args[0] === "finger" && args[1] === "moving") {
      const target = resolveVars(args[2]);
      const element = elementsByName[target];
      
      if (!element) {
        output.innerHTML += `<div>❗ Элемент '${target}' не найден</div>`;
        i++;
        continue;
      }
      
      const rect = element.getBoundingClientRect();
      const elementCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
      
      const distance = Math.sqrt(
        Math.pow(lastMousePosition.x - elementCenter.x, 2) + 
        Math.pow(lastMousePosition.y - elementCenter.y, 2)
      );
      
      fingerMoveStack.push({
        target: target,
        startIndex: i,
        lastDistance: distance,
        isMoving: false
      });
      
      i++;
      continue;
    }

    try {
      switch (cmd) {
        case "print":
          output.innerHTML += `<div>> ${resolveVars(rest)}</div>`;
          break;

        case "set":
          const [varName, eq, ...valueParts] = args;
          if (eq === "=") {
            const value = valueParts.join(" ");
            vars[varName] = evaluateExpression(value);
          }
          break;

        case "math":
          if (args.length < 4) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды math неправильный (нужно: math имя = выражение)</div>`;
            break;
          }
          const [mathVar, mathEq, ...mathExpr] = args;
          if (mathEq === "=") {
            vars[mathVar] = evaluateExpression(mathExpr.join(" "));
          }
          break;

        case "wait":
          const ms = parseInt(resolveVars(args[0]));
          await new Promise(res => setTimeout(res, ms));
          break;

        case "alert":
          alert(resolveVars(rest));
          break;

        case "draw":
          const color = resolveVars(args[0] || "#00ff88");
          const canvas = document.createElement("canvas");
          canvas.width = 200;
          canvas.height = 100;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = color;
          ctx.fillRect(20, 20, 160, 60);
          output.appendChild(canvas);
          break;

        case "sound":
          const soundUrl = resolveVars(args[0]);
          const audio = new Audio(soundUrl);
          await audio.play();
          break;

        case "button":
          if (args.length < 4) {
            output.innerHTML += `<div>❗ Ошибка: неправильный синтаксис кнопки</div>`;
            break;
          }
          const x = parseInt(args[0]);
          const y = parseInt(args[1]);
          const btnText = resolveVars(args[2].replace(/_/g, " "));
          let action = args.slice(3).join(" ");
          
          const commands = action.split(',').map(cmd => cmd.trim());
          
          const button = document.createElement("button");
          button.className = "custom-btn";
          button.innerText = btnText;
          button.style.left = x + "px";
          button.style.top = y + "px";
          button.onclick = () => {
            for (const cmd of commands) {
              runSingleCommand(cmd, output);
            }
          };
          output.appendChild(button);

          elementsByName[btnText] = button;
          break;

        case "x":
        case "y":
          if (args.length < 2) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды ${cmd} неправильный</div>`;
            break;
          }
          const targetName = resolveVars(args[0].replace(/_/g, " "));
          const delta = parseInt(resolveVars(args[1]));
          const el = elementsByName[targetName];
          if (!el) {
            output.innerHTML += `<div>❗ Элемент '${targetName}' не найден</div>`;
            break;
          }
          const current = parseInt(el.style[cmd === "x" ? "left" : "top"]) || 0;
          el.style[cmd === "x" ? "left" : "top"] = (current + delta) + "px";
          break;

        case "xy":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды xy неправильный (нужно: xy имя_кнопки deltaX deltaY)</div>`;
            break;
          }
          const targetNameXY = resolveVars(args[0].replace(/_/g, " "));
          const deltaX = parseInt(resolveVars(args[1]));
          const deltaY = parseInt(resolveVars(args[2]));
          const elXY = elementsByName[targetNameXY];
          if (!elXY) {
            output.innerHTML += `<div>❗ Элемент '${targetNameXY}' не найден</div>`;
            break;
          }
          const currentX = parseInt(elXY.style.left) || 0;
          const currentY = parseInt(elXY.style.top) || 0;
          elXY.style.left = (currentX + deltaX) + "px";
          elXY.style.top = (currentY + deltaY) + "px";
          break;

        case "rotate":
          if (args.length < 2) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды rotate неправильный (нужно: rotate имя_элемента градусы)</div>`;
            break;
          }
          const rotateTarget = resolveVars(args[0].replace(/_/g, " "));
          const degrees = parseInt(resolveVars(args[1]));
          const rotateEl = elementsByName[rotateTarget];
          if (!rotateEl) {
            output.innerHTML += `<div>❗ Элемент '${rotateTarget}' не найден</div>`;
            break;
          }
          rotateEl.style.transform = `rotate(${degrees}deg)`;
          break;

        case "image":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды image неправильный (нужно: image имя_картинки x y)</div>`;
            break;
          }
          const imgName = resolveVars(args[0]);
          const imgX = parseInt(resolveVars(args[1]));
          const imgY = parseInt(resolveVars(args[2]));
          
          if (!images[imgName]) {
            output.innerHTML += `<div>❗ Картинка '${imgName}' не найдена</div>`;
            break;
          }
          
          const imgElement = document.createElement('img');
          imgElement.src = images[imgName];
          imgElement.style.position = 'absolute';
          imgElement.style.left = imgX + 'px';
          imgElement.style.top = imgY + 'px';
          imgElement.className = 'dimscript-image';
          imgElement.dataset.name = imgName;
          output.appendChild(imgElement);
          
          elementsByName[imgName] = imgElement;
          break;

        case "color":
          if (args.length < 2) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды color неправильный (нужно: color имя_элемента hex_цвета)</div>`;
            break;
          }
          const colorTargetName = resolveVars(args[0].replace(/_/g, " "));
          const hexColor = resolveVars(args[1]);
          const colorEl = elementsByName[colorTargetName];
          if (!colorEl) {
            output.innerHTML += `<div>❗ Элемент '${colorTargetName}' не найден</div>`;
            break;
          }
          if (!/^#[0-9A-F]{6}$/i.test(hexColor)) {
            output.innerHTML += `<div>❗ Неверный формат цвета. Используйте HEX (например, #FFFFFF)</div>`;
            break;
          }
          colorEl.style.backgroundColor = hexColor;
          break;

        case "size":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды size неправильный (нужно: size имя_элемента ширина высота)</div>`;
            break;
          }
          const sizeTargetName = resolveVars(args[0].replace(/_/g, " "));
          const width = resolveVars(args[1]);
          const height = resolveVars(args[2]);
          const sizeEl = elementsByName[sizeTargetName];
          if (!sizeEl) {
            output.innerHTML += `<div>❗ Элемент '${sizeTargetName}' не найден</div>`;
            break;
          }
          sizeEl.style.width = width + (isNaN(width) ? "" : "px");
          sizeEl.style.height = height + (isNaN(height) ? "" : "px");
          break;

        case "width":
          if (args.length < 2) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды width неправильный (нужно: width имя_элемента значение)</div>`;
            break;
          }
          const widthTargetName = resolveVars(args[0].replace(/_/g, " "));
          const widthValue = resolveVars(args[1]);
          const widthEl = elementsByName[widthTargetName];
          if (!widthEl) {
            output.innerHTML += `<div>❗ Элемент '${widthTargetName}' не найден</div>`;
            break;
          }
          const currentHeight = parseInt(widthEl.style.height) || 0;
          widthEl.style.width = widthValue + (isNaN(widthValue) ? "" : "px");
          break;

        case "height":
          if (args.length < 2) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды height неправильный (нужно: height имя_элемента значение)</div>`;
            break;
          }
          const heightTargetName = resolveVars(args[0].replace(/_/g, " "));
          const heightValue = resolveVars(args[1]);
          const heightEl = elementsByName[heightTargetName];
          if (!heightEl) {
            output.innerHTML += `<div>❗ Элемент '${heightTargetName}' не найден</div>`;
            break;
          }
          const currentWidth = parseInt(heightEl.style.width) || 0;
          heightEl.style.height = heightValue + (isNaN(heightValue) ? "" : "px");
          break;

        case "nail":
          if (args.length < 2) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды nail неправильный (нужно: nail имя x y)</div>`;
            break;
          }
          const nailName = resolveVars(args[0]);
          const nailX = parseInt(resolveVars(args[1]));
          const nailY = parseInt(resolveVars(args[2]));
          
          const nail = document.createElement('div');
          nail.className = 'dimscript-nail';
          nail.style.left = nailX + 'px';
          nail.style.top = nailY + 'px';
          nail.dataset.name = nailName;
          output.appendChild(nail);
          
          elementsByName[nailName] = nail;
          break;

        case "text":
          if (args.length < 4) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды text неправильный (нужно: text имя x y "текст")</div>`;
            break;
          }
          const textName = resolveVars(args[0]);
          const textX = parseInt(resolveVars(args[1]));
          const textY = parseInt(resolveVars(args[2]));
          const textContent = resolveVars(args.slice(3).join(" ")).replace(/"/g, '');
          
          const textElement = document.createElement('div');
          textElement.className = 'dimscript-text';
          textElement.textContent = textContent;
          textElement.style.left = textX + 'px';
          textElement.style.top = textY + 'px';
          textElement.dataset.name = textName;
          output.appendChild(textElement);
          
          elementsByName[textName] = textElement;
          break;

        case "circle":
          if (args.length < 4) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды circle неправильный (нужно: circle имя x y радиус цвет)</div>`;
            break;
          }
          const circleName = resolveVars(args[0]);
          const circleX = parseInt(resolveVars(args[1]));
          const circleY = parseInt(resolveVars(args[2]));
          const radius = parseInt(resolveVars(args[3]));
          const circleColor = resolveVars(args[4] || "#00ff88");
          
          const circle = document.createElement('div');
          circle.className = 'dimscript-circle';
          circle.style.left = circleX + 'px';
          circle.style.top = circleY + 'px';
          circle.style.width = radius * 2 + 'px';
          circle.style.height = radius * 2 + 'px';
          circle.style.backgroundColor = circleColor;
          circle.dataset.name = circleName;
          output.appendChild(circle);
          
          elementsByName[circleName] = circle;
          break;

        case "rect":
          if (args.length < 5) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды rect неправильный (нужно: rect имя x y ширина высота цвет)</div>`;
            break;
          }
          const rectName = resolveVars(args[0]);
          const rectX = parseInt(resolveVars(args[1]));
          const rectY = parseInt(resolveVars(args[2]));
          const rectWidth = parseInt(resolveVars(args[3]));
          const rectHeight = parseInt(resolveVars(args[4]));
          const rectColor = resolveVars(args[5] || "#00ff88");
          
          const rect = document.createElement('div');
          rect.className = 'dimscript-rect';
          rect.style.left = rectX + 'px';
          rect.style.top = rectY + 'px';
          rect.style.width = rectWidth + 'px';
          rect.style.height = rectHeight + 'px';
          rect.style.backgroundColor = rectColor;
          rect.dataset.name = rectName;
          output.appendChild(rect);
          
          elementsByName[rectName] = rect;
          break;

        case "line":
          if (args.length < 5) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды line неправильный (ну нужно: line имя x1 y1 x2 y2 цвет толщина)</div>`;
            break;
          }
          const lineName = resolveVars(args[0]);
          const x1 = parseInt(resolveVars(args[1]));
          const y1 = parseInt(resolveVars(args[2]));
          const x2 = parseInt(resolveVars(args[3]));
          const y2 = parseInt(resolveVars(args[4]));
          const lineColor = resolveVars(args[5] || "#00ff88");
          const thickness = parseInt(resolveVars(args[6] || "1"));
          
          const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
          const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
          
          const line = document.createElement('div');
          line.className = 'dimscript-line';
          line.style.left = x1 + 'px';
          line.style.top = y1 + 'px';
          line.style.width = length + 'px';
          line.style.height = thickness + 'px';
          line.style.backgroundColor = lineColor;
          line.style.transform = `rotate(${angle}deg)`;
          line.dataset.name = lineName;
          output.appendChild(line);
          
          elementsByName[lineName] = line;
          break;

        case "remove":
        case "delete":
          if (args.length < 1) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды ${cmd} неправильный (нужно: ${cmd} имя_элемента)</div>`;
            break;
          }
          const removeName = resolveVars(args[0]);
          const removeEl = elementsByName[removeName];
          if (!removeEl) {
            output.innerHTML += `<div>❗ Элемент '${removeName}' не найден</div>`;
            break;
          }
          removeEl.remove();
          delete elementsByName[removeName];
          break;

        case "clear":
          output.innerHTML = "";
          for (const key in elementsByName) {
            delete elementsByName[key];
          }
          break;

        case "timer":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды timer неправильный (нужно: timer имя время_мс команда)</div>`;
            break;
          }
          const timerName = resolveVars(args[0]);
          const timerMs = parseInt(resolveVars(args[1]));
          const timerCommand = args.slice(2).join(" ");
          
          if (timers[timerName]) {
            clearTimeout(timers[timerName]);
          }
          
          timers[timerName] = setTimeout(() => {
            runSingleCommand(timerCommand, output);
          }, timerMs);
          break;

        case "stoptimer":
          if (args.length < 1) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды stoptimer неправильный (нужно: stoptimer имя)</div>`;
            break;
          }
          const stopTimerName = resolveVars(args[0]);
          if (timers[stopTimerName]) {
            clearTimeout(timers[stopTimerName]);
            delete timers[stopTimerName];
            break;
          }
          break;

        case "random":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды random неправильный (нужно: random имя_переменной min max)</div>`;
            break;
          }
          const randomVar = resolveVars(args[0]);
          const min = parseInt(resolveVars(args[1]));
          const max = parseInt(resolveVars(args[2]));
          vars[randomVar] = Math.floor(Math.random() * (max - min + 1)) + min;
          break;

        case "date":
          if (args.length < 1) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды date неправильный (нужно: date имя_переменной)</div>`;
            break;
          }
          const dateVar = resolveVars(args[0]);
          vars[dateVar] = new Date().toLocaleString();
          break;

        case "prompt":
          if (args.length < 2) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды prompt неправильный (нужно: prompt имя_переменной "сообщение")</div>`;
            break;
          }
          const promptVar = resolveVars(args[0]);
          const message = resolveVars(args.slice(1).join(" ")).replace(/"/g, '');
          vars[promptVar] = prompt(message);
          break;

        case "confirm":
          if (args.length < 2) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды confirm неправильный (нужно: confirm имя_переменной "сообщение")</div>`;
            break;
          }
          const confirmVar = resolveVars(args[0]);
          const confirmMessage = resolveVars(args.slice(1).join(" ")).replace(/"/g, '');
          vars[confirmVar] = confirm(confirmMessage);
          break;

        case "touch":
          if (args.length < 2) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды touch неправильный (нужно: touch имя_элемента команда)</div>`;
            break;
          }
          const touchName = resolveVars(args[0]);
          const touchCommand = args.slice(1).join(" ");
          
          const touchEl = elementsByName[touchName];
          if (!touchEl) {
            output.innerHTML += `<div>❗ Элемент '${touchName}' не найден</div>`;
            break;
          }
          
          touchElements[touchName] = {
            command: touchCommand,
            isTouching: false,
            currentIndex: i
          };
          
          if (touchEl.onclick) {
            const oldClick = touchEl.onclick;
            touchEl.onclick = function(e) {
              oldClick.call(this, e);
              runSingleCommand(touchCommand, output);
            };
          } else {
            touchEl.onclick = function() {
              runSingleCommand(touchCommand, output);
            };
          }
          break;

        case "touch2":
          if (args.length < 2) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды touch2 неправильный (нужно: touch2 имя_элемента команда)</div>`;
            break;
          }
          const touch2Name = resolveVars(args[0]);
          const touch2Command = args.slice(1).join(" ");
          
          const touch2El = elementsByName[touch2Name];
          if (!touch2El) {
            output.innerHTML += `<div>❗ Элемент '${touch2Name}' не найден</div>`;
            break;
          }
          
          touchElements[touch2Name] = {
            command: touch2Command,
            isTouching: false,
            currentIndex: i
          };
          break;

        case "endtouch":
          if (args.length < 1) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды endtouch неправильный (нужно: endtouch имя_элемента)</div>`;
            break;
          }
          const endTouchName = resolveVars(args[0]);
          if (touchElements[endTouchName]) {
            delete touchElements[endTouchName];
          }
          break;

        case "move":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды move неправильный (нужно: move имя_элемента x y)</div>`;
            break;
          }
          const moveName = resolveVars(args[0]);
          const moveX = parseInt(resolveVars(args[1]));
          const moveY = parseInt(resolveVars(args[2]));
          const moveEl = elementsByName[moveName];
          if (!moveEl) {
            output.innerHTML += `<div>❗ Элемент '${moveName}' не найден</div>`;
            break;
          }
          moveEl.style.left = moveX + 'px';
          moveEl.style.top = moveY + 'px';
          break;

        case "move2":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды move2 неправильный (нужно: move2 имя_элемента x y)</div>`;
            break;
          }
          const move2Name = resolveVars(args[0]);
          const move2X = parseInt(resolveVars(args[1]));
          const move2Y = parseInt(resolveVars(args[2]));
          const move2El = elementsByName[move2Name];
          if (!move2El) {
            output.innerHTML += `<div>❗ Элемент '${move2Name}' не найден</div>`;
            break;
          }
          move2El.style.left = move2X + 'px';
          move2El.style.top = move2Y + 'px';
          break;

        case "move3":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды move3 неправильный (нужно: move3 имя_элемента x y)</div>`;
            break;
          }
          const move3Name = resolveVars(args[0]);
          const move3X = parseInt(resolveVars(args[1]));
          const move3Y = parseInt(resolveVars(args[2]));
          const move3El = elementsByName[move3Name];
          if (!move3El) {
            output.innerHTML += `<div>❗ Элемент '${move3Name}' не найден</div>`;
            break;
          }
          move3El.style.left = move3X + 'px';
          move3El.style.top = move3Y + 'px';
          break;

        case "move4":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды move4 неправильный (нужно: move4 имя_элемента x y)</div>`;
            break;
          }
          const move4Name = resolveVars(args[0]);
          const move4X = parseInt(resolveVars(args[1]));
          const move4Y = parseInt(resolveVars(args[2]));
          const move4El = elementsByName[move4Name];
          if (!move4El) {
            output.innerHTML += `<div>❗ Элемент '${move4Name}' не найден</div>`;
            break;
          }
          move4El.style.left = move4X + 'px';
          move4El.style.top = move4Y + 'px';
          break;

        case "move5":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды move5 неправильный (нужно: move5 имя_элемента x y)</div>`;
            break;
          }
          const move5Name = resolveVars(args[0]);
          const move5X = parseInt(resolveVars(args[1]));
          const move5Y = parseInt(resolveVars(args[2]));
          const move5El = elementsByName[move5Name];
          if (!move5El) {
            output.innerHTML += `<div>❗ Элемент '${move5Name}' не найден</div>`;
            break;
          }
          move5El.style.left = move5X + 'px';
          move5El.style.top = move5Y + 'px';
          break;

        case "move6":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды move6 неправильный (нужно: move6 имя_элемента x y)</div>`;
            break;
          }
          const move6Name = resolveVars(args[0]);
          const move6X = parseInt(resolveVars(args[1]));
          const move6Y = parseInt(resolveVars(args[2]));
          const move6El = elementsByName[move6Name];
          if (!move6El) {
            output.innerHTML += `<div>❗ Элемент '${move6Name}' не найден</div>`;
            break;
          }
          move6El.style.left = move6X + 'px';
          move6El.style.top = move6Y + 'px';
          break;

        case "move7":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды move7 неправильный (нужно: move7 имя_элемента x y)</div>`;
            break;
          }
          const move7Name = resolveVars(args[0]);
          const move7X = parseInt(resolveVars(args[1]));
          const move7Y = parseInt(resolveVars(args[2]));
          const move7El = elementsByName[move7Name];
          if (!move7El) {
            output.innerHTML += `<div>❗ Элемент '${move7Name}' не найден</div>`;
            break;
          }
          move7El.style.left = move7X + 'px';
          move7El.style.top = move7Y + 'px';
          break;

        case "move8":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды move8 неправильный (нужно: move8 имя_элемента x y)</div>`;
            break;
          }
          const move8Name = resolveVars(args[0]);
          const move8X = parseInt(resolveVars(args[1]));
          const move8Y = parseInt(resolveVars(args[2]));
          const move8El = elementsByName[move8Name];
          if (!move8El) {
            output.innerHTML += `<div>❗ Элемент '${move8Name}' не найден</div>`;
            break;
          }
          move8El.style.left = move8X + 'px';
          move8El.style.top = move8Y + 'px';
          break;

        case "move9":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды move9 неправильный (нужно: move9 имя_элемента x y)</div>`;
            break;
          }
          const move9Name = resolveVars(args[0]);
          const move9X = parseInt(resolveVars(args[1]));
          const move9Y = parseInt(resolveVars(args[2]));
          const move9El = elementsByName[move9Name];
          if (!move9El) {
            output.innerHTML += `<div>❗ Элемент '${move9Name}' не найден</div>`;
            break;
          }
          move9El.style.left = move9X + 'px';
          move9El.style.top = move9Y + 'px';
          break;

        case "move10":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды move10 неправильный (нужно: move10 имя_элемента x y)</div>`;
            break;
          }
          const move10Name = resolveVars(args[0]);
          const move10X = parseInt(resolveVars(args[1]));
          const move10Y = parseInt(resolveVars(args[2]));
          const move10El = elementsByName[move10Name];
          if (!move10El) {
            output.innerHTML += `<div>❗ Элемент '${move10Name}' не найден</div>`;
            break;
          }
          move10El.style.left = move10X + 'px';
          move10El.style.top = move10Y + 'px';
          break;

        case "move11":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды move11 неправильный (нужно: move11 имя_элемента x y)</div>`;
            break;
          }
          const move11Name = resolveVars(args[0]);
          const move11X = parseInt(resolveVars(args[1]));
          const move11Y = parseInt(resolveVars(args[2]));
          const move11El = elementsByName[move11Name];
          if (!move11El) {
            output.innerHTML += `<div>❗ Элемент '${move11Name}' не найден</div>`;
            break;
          }
          move11El.style.left = move11X + 'px';
          move11El.style.top = move11Y + 'px';
          break;

        case "move12":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды move12 неправильный (нужно: move12 имя_элемента x y)</div>`;
            break;
          }
          const move12Name = resolveVars(args[0]);
          const move12X = parseInt(resolveVars(args[1]));
          const move12Y = parseInt(resolveVars(args[2]));
          const move12El = elementsByName[move12Name];
          if (!move12El) {
            output.innerHTML += `<div>❗ Элемент '${move12Name}' не найден</div>`;
            break;
          }
          move12El.style.left = move12X + 'px';
          move12El.style.top = move12Y + 'px';
          break;

        case "move13":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды move13 неправильный (нужно: move13 имя_элемента x y)</div>`;
            break;
          }
          const move13Name = resolveVars(args[0]);
          const move13X = parseInt(resolveVars(args[1]));
          const move13Y = parseInt(resolveVars(args[2]));
          const move13El = elementsByName[move13Name];
          if (!move13El) {
            output.innerHTML += `<div>❗ Элемент '${move13Name}' не найден</div>`;
            break;
          }
          move13El.style.left = move13X + 'px';
          move13El.style.top = move13Y + 'px';
          break;

        case "move14":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды move14 неправильный (нужно: move14 имя_элемента x y)</div>`;
            break;
          }
          const move14Name = resolveVars(args[0]);
          const move14X = parseInt(resolveVars(args[1]));
          const move14Y = parseInt(resolveVars(args[2]));
          const move14El = elementsByName[move14Name];
          if (!move14El) {
            output.innerHTML += `<div>❗ Элемент '${move14Name}' не найден</div>`;
            break;
          }
          move14El.style.left = move14X + 'px';
          move14El.style.top = move14Y + 'px';
          break;

        case "move15":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды move15 неправильный (нужно: move15 имя_элемента x y)</div>`;
            break;
          }
          const move15Name = resolveVars(args[0]);
          const move15X = parseInt(resolveVars(args[1]));
          const move15Y = parseInt(resolveVars(args[2]));
          const move15El = elementsByName[move15Name];
          if (!move15El) {
            output.innerHTML += `<div>❗ Элемент '${move15Name}' не найден</div>`;
            break;
          }
          move15El.style.left = move15X + 'px';
          move15El.style.top = move15Y + 'px';
          break;

        case "move16":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды move16 неправильный (нужно: move16 имя_элемента x y)</div>`;
            break;
          }
          const move16Name = resolveVars(args[0]);
          const move16X = parseInt(resolveVars(args[1]));
          const move16Y = parseInt(resolveVars(args[2]));
          const move16El = elementsByName[move16Name];
          if (!move16El) {
            output.innerHTML += `<div>❗ Элемент '${move16Name}' не найден</div>`;
            break;
          }
          move16El.style.left = move16X + 'px';
          move16El.style.top = move16Y + 'px';
          break;

        case "move17":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды move17 неправильный (нужно: move17 имя_элемента x y)</div>`;
            break;
          }
          const move17Name = resolveVars(args[0]);
          const move17X = parseInt(resolveVars(args[1]));
          const move17Y = parseInt(resolveVars(args[2]));
          const move17El = elementsByName[move17Name];
          if (!move17El) {
            output.innerHTML += `<div>❗ Элемент '${move17Name}' не найден</div>`;
            break;
          }
          move17El.style.left = move17X + 'px';
          move17El.style.top = move17Y + 'px';
          break;

        case "move18":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды move18 неправильный (нужно: move18 имя_элемента x y)</div>`;
            break;
          }
          const move18Name = resolveVars(args[0]);
          const move18X = parseInt(resolveVars(args[1]));
          const move18Y = parseInt(resolveVars(args[2]));
          const move18El = elementsByName[move18Name];
          if (!move18El) {
            output.innerHTML += `<div>❗ Элемент '${move18Name}' не найден</div>`;
            break;
          }
          move18El.style.left = move18X + 'px';
          move18El.style.top = move18Y + 'px';
          break;

        case "move19":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды move19 неправильный (нужно: move19 имя_элемента x y)</div>`;
            break;
          }
          const move19Name = resolveVars(args[0]);
          const move19X = parseInt(resolveVars(args[1]));
          const move19Y = parseInt(resolveVars(args[2]));
          const move19El = elementsByName[move19Name];
          if (!move19El) {
            output.innerHTML += `<div>❗ Элемент '${move19Name}' не найден</div>`;
            break;
          }
          move19El.style.left = move19X + 'px';
          move19El.style.top = move19Y + 'px';
          break;

        case "move20":
          if (args.length < 3) {
            output.innerHTML += `<div>❗ Ошибка: синтаксис команды move20 неправильный (нужно: move20 имя_элемента x y)</div>`;
            break;
          }
          const move20Name = resolveVars(args[0]);
          const move20X = parseInt(resolveVars(args[1]));
          const move20Y = parseInt(resolveVars(args[2]));
          const move20El = elementsByName[move20Name];
          if (!move20El) {
            output.innerHTML += `<div>❗ Элемент '${move20Name}' не найден</div>`;
            break;
          }
          move20El.style.left = move20X + 'px';
          move20El.style.top = move20Y + 'px';
          break;

        default:
          output.innerHTML += `<div>❗ Неизвестная команда: ${cmd}</div>`;
      }
    } catch (e) {
      output.innerHTML += `<div>❗ Ошибка выполнения команды '${cmd}': ${e.message}</div>`;
    }

    i++;
  }
}

function runSingleCommand(command, output) {
  const parts = command.trim().split(" ");
  const cmd = parts[0];
  const args = parts.slice(1);
  const rest = args.join(" ");

  try {
    switch (cmd) {
      case "print":
        output.innerHTML += `<div>> ${resolveVars(rest)}</div>`;
        break;

      case "set":
        const [varName, eq, ...valueParts] = args;
        if (eq === "=") {
          const value = valueParts.join(" ");
          vars[varName] = evaluateExpression(value);
        }
        break;

      case "alert":
        alert(resolveVars(rest));
        break;

      case "clear":
        output.innerHTML = "";
        for (const key in elementsByName) {
          delete elementsByName[key];
        }
        break;

      case "signal":
        const signalName = resolveVars(args[0]);
        signals[signalName] = true;
        break;

      default:
        output.innerHTML += `<div>❗ Неизвестная команда: ${cmd}</div>`;
    }
  } catch (e) {
    output.innerHTML += `<div>❗ Ошибка выполнения команды '${cmd}': ${e.message}</div>`;
  }
}

function goBack() {
  document.getElementById("editor").style.display = "block";
  document.getElementById("backBtn").style.display = "none";
  document.getElementById("output").innerHTML = "";
  
  for (const id in timers) {
    clearTimeout(timers[id]);
    delete timers[id];
  }
  
  for (const key in elementsByName) {
    delete elementsByName[key];
  }
  
  for (const key in touchElements) {
    delete touchElements[key];
  }
  
  loopStack = [];
  ifStack = [];
  signalStack = [];
  fingerMoveStack = [];
}
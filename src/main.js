const basePath = process.cwd(); // 获取当前工作目录
const { NETWORK } = require(`${basePath}/constants/network.js`); // 引入网络配置
const fs = require("fs"); // 文件系统模块
const sha1 = require(`${basePath}/node_modules/sha1`); // sha1 加密模块
const { createCanvas, loadImage } = require(`${basePath}/node_modules/canvas`); // Canvas 模块，用于图像生成
const buildDir = `${basePath}/build`; // 构建目录
const layersDir = `${basePath}/layers`; // 图层目录
const {
  format,
  baseUri,
  description,
  background,
  uniqueDnaTorrance,
  layerConfigurations,
  rarityDelimiter,
  shuffleLayerConfigurations,
  debugLogs,
  extraMetadata,
  text,
  namePrefix,
  network,
  solanaMetadata,
  gif,
} = require(`${basePath}/src/config.js`); // 引入配置文件

// 创建画布和上下文
const canvas = createCanvas(format.width, format.height);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = format.smoothing; // 设置图像平滑

// 初始化变量
var metadataList = [];
var attributesList = [];
var dnaList = new Set();
const DNA_DELIMITER = "-"; // DNA 分隔符
const HashlipsGiffer = require(`${basePath}/modules/HashlipsGiffer.js`); // GIF 模块

let hashlipsGiffer = null; // 初始化 GIF 变量

// 构建设置函数，创建必要的目录
const buildSetup = () => {
  if (fs.existsSync(buildDir)) {
    fs.rmdirSync(buildDir, { recursive: true }); // 如果构建目录存在，递归删除
  }
  fs.mkdirSync(buildDir); // 创建构建目录
  fs.mkdirSync(`${buildDir}/json`); // 创建 JSON 目录
  fs.mkdirSync(`${buildDir}/images`); // 创建图像目录
  if (gif.export) {
    fs.mkdirSync(`${buildDir}/gifs`); // 如果需要导出 GIF，创建 GIF 目录
  }
};

// 获取稀有度权重
const getRarityWeight = (_str) => {
  let nameWithoutExtension = _str.slice(0, -4); // 去掉文件扩展名
  var nameWithoutWeight = Number(
    nameWithoutExtension.split(rarityDelimiter).pop()
  );
  if (isNaN(nameWithoutWeight)) {
    nameWithoutWeight = 1;
  }
  return nameWithoutWeight;
};

// 清理 DNA 字符串
const cleanDna = (_str) => {
  const withoutOptions = removeQueryStrings(_str);
  var dna = Number(withoutOptions.split(":").shift());
  return dna;
};

// 清理名称
const cleanName = (_str) => {
  let nameWithoutExtension = _str.slice(0, -4);
  var nameWithoutWeight = nameWithoutExtension.split(rarityDelimiter).shift();
  return nameWithoutWeight;
};

// 获取图层元素
const getElements = (path) => {
  return fs
    .readdirSync(path)
    .filter((item) => !/(^|\/)\.[^\/\.]/g.test(item))
    .map((i, index) => {
      if (i.includes("-")) {
        throw new Error(`layer name can not contain dashes, please fix: ${i}`);
      }
      return {
        id: index,
        name: cleanName(i),
        filename: i,
        path: `${path}${i}`,
        weight: getRarityWeight(i),
      };
    });
};

const layersSetup = (layersOrder) => {
  const layers = layersOrder.map((layerObj, index) => ({
    id: index,
    elements: getElements(`${layersDir}/${layerObj.name}/`),
    name:
      layerObj.options?.["displayName"] != undefined
        ? layerObj.options?.["displayName"]
        : layerObj.name,
    blend:
      layerObj.options?.["blend"] != undefined
        ? layerObj.options?.["blend"]
        : "source-over",
    opacity:
      layerObj.options?.["opacity"] != undefined
        ? layerObj.options?.["opacity"]
        : 1,
    bypassDNA:
      layerObj.options?.["bypassDNA"] !== undefined
        ? layerObj.options?.["bypassDNA"]
        : false,
  }));
  return layers;
};

// 保存图像
const saveImage = (_editionCount) => {
  fs.writeFileSync(
    `${buildDir}/images/${_editionCount}.png`,
    canvas.toBuffer("image/png")
  );
};

// 生成颜色
const genColor = () => {
  let hue = Math.floor(Math.random() * 360);
  let pastel = `hsl(${hue}, 100%, ${background.brightness})`;
  return pastel;
};

// 绘制背景
const drawBackground = () => {
  ctx.fillStyle = background.static ? background.default : genColor();
  ctx.fillRect(0, 0, format.width, format.height);
};

// 添加元数据
const addMetadata = (_dna, _edition) => {
  let dateTime = Date.now();
  let tempMetadata = {
    name: `${namePrefix} #${_edition}`,
    description: description,
    image: `${baseUri}/${_edition}.png`,
    dna: sha1(_dna),
    edition: _edition,
    date: dateTime,
    ...extraMetadata,
    attributes: attributesList,
    compiler: "HashLips Art Engine",
  };
  if (network == NETWORK.sol) {
    tempMetadata = {
      // 添加 Solana 元数据
      name: tempMetadata.name,
      symbol: solanaMetadata.symbol,
      description: tempMetadata.description,
      seller_fee_basis_points: solanaMetadata.seller_fee_basis_points,
      image: `${_edition}.png`,
      external_url: solanaMetadata.external_url,
      edition: _edition,
      ...extraMetadata,
      attributes: tempMetadata.attributes,
      properties: {
        files: [
          {
            uri: `${_edition}.png`,
            type: "image/png",
          },
        ],
        category: "image",
        creators: solanaMetadata.creators,
      },
    };
  }
  metadataList.push(tempMetadata);
  attributesList = [];
};

// 添加属性
const addAttributes = (_element) => {
  let selectedElement = _element.layer.selectedElement;
  attributesList.push({
    trait_type: _element.layer.name,
    value: selectedElement.name,
  });
};

// 加载图层图像
const loadLayerImg = async (_layer) => {
  try {
    return new Promise(async (resolve) => {
      const image = await loadImage(`${_layer.selectedElement.path}`);
      resolve({ layer: _layer, loadedImage: image });
    });
  } catch (error) {
    console.error("Error loading image:", error);
  }
};

// 添加文本
const addText = (_sig, x, y, size) => {
  ctx.fillStyle = text.color;
  ctx.font = `${text.weight} ${size}pt ${text.family}`;
  ctx.textBaseline = text.baseline;
  ctx.textAlign = text.align;
  ctx.fillText(_sig, x, y);
};

// 绘制元素
const drawElement = (_renderObject, _index, _layersLen) => {
  ctx.globalAlpha = _renderObject.layer.opacity;
  ctx.globalCompositeOperation = _renderObject.layer.blend;
  text.only
    ? addText(
        `${_renderObject.layer.name}${text.spacer}${_renderObject.layer.selectedElement.name}`,
        text.xGap,
        text.yGap * (_index + 1),
        text.size
      )
    : ctx.drawImage(
        _renderObject.loadedImage,
        0,
        0,
        format.width,
        format.height
      );

  addAttributes(_renderObject);
};

// 构建 DNA 到图层的映射
const constructLayerToDna = (_dna = "", _layers = []) => {
  let mappedDnaToLayers = _layers.map((layer, index) => {
    let selectedElement = layer.elements.find(
      (e) => e.id == cleanDna(_dna.split(DNA_DELIMITER)[index])
    );
    return {
      name: layer.name,
      blend: layer.blend,
      opacity: layer.opacity,
      selectedElement: selectedElement,
    };
  });
  return mappedDnaToLayers;
};

// 过滤 DNA 选项
const filterDNAOptions = (_dna) => {
  const dnaItems = _dna.split(DNA_DELIMITER);
  const filteredDNA = dnaItems.filter((element) => {
    const query = /(\?.*$)/;
    const querystring = query.exec(element);
    if (!querystring) {
      return true;
    }
    const options = querystring[1].split("&").reduce((r, setting) => {
      const keyPairs = setting.split("=");
      return { ...r, [keyPairs[0]]: keyPairs[1] };
    }, []);

    return options.bypassDNA;
  });

  return filteredDNA.join(DNA_DELIMITER);
};

// 移除 DNA 字符串中的查询参数
const removeQueryStrings = (_dna) => {
  const query = /(\?.*$)/;
  return _dna.replace(query, "");
};

// 检查 DNA 是否唯一
const isDnaUnique = (_DnaList = new Set(), _dna = "") => {
  const _filteredDNA = filterDNAOptions(_dna);
  return !_DnaList.has(_filteredDNA);
};

// 判断是否命中依赖规则
const matchDependencyRule = (
  selectedElements,
  currentLayerName,
  dependencyRules
) => {
  const usedLayerArray = Object.keys(selectedElements);

  for (const rule of dependencyRules) {
    if (
      usedLayerArray.includes(rule.layerA) &&
      selectedElements[rule.layerA] === rule.valueA &&
      rule.layerB === currentLayerName
    ) {
      return true;
    }
  }

  return false;
};

// 判断是否命中互斥规则
const matchMutuallyExclusiveRule = (
  selectedElements,
  currentLayerName,
  mutuallyExclusiveRules
) => {
  const usedLayerArray = Object.keys(selectedElements);

  for (const rule of mutuallyExclusiveRules) {
    if (
      usedLayerArray.includes(rule.layerA) &&
      selectedElements[rule.layerA] === rule.valueA &&
      rule.layerB === currentLayerName
    ) {
      return true;
    }
  }

  return false;
};

// 保留依赖规则的元素
const filterDependencyElements = (
  selectedElements,
  currentLayerName,
  dependencyRules,
  allElements
) => {
  const elementsMap = new Map();
  allElements.forEach((element) => {
    elementsMap.set(element.name, element);
  });
  const _elements = new Set();
  const usedLayerArray = Object.keys(selectedElements);

  for (const rule of dependencyRules) {
    if (
      usedLayerArray.includes(rule.layerA) &&
      selectedElements[rule.layerA] === rule.valueA &&
      rule.layerB === currentLayerName
    ) {
      const element = elementsMap.get(rule.valueB);
      if (element) {
        _elements.add(element);
      }
    }
  }

  return Array.from(_elements);
};

// 过滤互斥元素
const filterMutuallyExclusiveElements = (
  selectedElements,
  currentLayerName,
  mutuallyExclusiveRules,
  allElements
) => {
  const elementsMap = new Map();
  allElements.forEach((element) => {
    elementsMap.set(element.name, element);
  });
  const _elements = new Set(allElements); // 从所有元素开始
  const usedLayerArray = Object.keys(selectedElements);

  for (const rule of mutuallyExclusiveRules) {
    if (
      usedLayerArray.includes(rule.layerA) &&
      selectedElements[rule.layerA] === rule.valueA &&
      rule.layerB === currentLayerName
    ) {
      const element = elementsMap.get(rule.valueB);
      if (element) {
        _elements.delete(element);
      }
    }
  }

  return Array.from(_elements);
};

// 创建 DNA
const createDna = (_layers, mutuallyExclusiveRules, dependencyRules) => {
  let randNum = [];
  let selectedElements = {};

  // 遍历图层
  _layers.forEach((layer) => {
    let _elements = layer.elements.slice();

    if (matchDependencyRule(selectedElements, layer.name, dependencyRules)) {
      _elements = filterDependencyElements(
        selectedElements,
        layer.name,
        dependencyRules,
        layer.elements
      );
    }

    if (
      matchMutuallyExclusiveRule(
        selectedElements,
        layer.name,
        mutuallyExclusiveRules
      )
    ) {
      _elements = filterMutuallyExclusiveElements(
        selectedElements,
        layer.name,
        mutuallyExclusiveRules,
        _elements
      );
    }

    // 选取内容
    let totalWeight = 0;
    _elements.forEach((element) => {
      totalWeight += element.weight;
    });

    // 随机数在 0 到 totalWeight 之间
    let random = Math.floor(Math.random() * totalWeight);
    for (let i = 0; i < _elements.length; i++) {
      // 从随机数中减去当前权重，直到达到负值
      random -= _elements[i].weight;
      if (random < 0) {
        selectedElements[layer.name] = _elements[i].name;
        randNum.push(
          `${_elements[i].id}:${_elements[i].filename}${
            layer.bypassDNA ? "?bypassDNA=true" : ""
          }`
        );
        break; // 找到匹配元素后跳出循环
      }
    }
  });

  return randNum.join(DNA_DELIMITER);
};

const writeMetaData = (_data) => {
  fs.writeFileSync(`${buildDir}/json/_metadata.json`, _data);
};

// 保存单个文件的元数据
const saveMetaDataSingleFile = (_editionCount) => {
  let metadata = metadataList.find((meta) => meta.edition == _editionCount);
  debugLogs
    ? console.log(
        `Writing metadata for ${_editionCount}: ${JSON.stringify(metadata)}`
      )
    : null;
  fs.writeFileSync(
    `${buildDir}/json/${_editionCount}.json`,
    JSON.stringify(metadata, null, 2)
  );
};

// 洗牌数组
function shuffle(array) {
  let currentIndex = array.length,
    randomIndex;

  // 当还有剩余元素要被打乱时
  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // 交换当前元素与随机选择的元素
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }
  return array;
}

const test = () => {
  console.log(layerConfigurations[0]);
};

// 开始生成
const startCreating = async () => {
  let layerConfigIndex = 0;
  let editionCount = 1;
  let failedCount = 0;

  // 待生成NFT的数组
  let abstractedIndexes = [];
  for (
    let i = network == NETWORK.sol ? 0 : 1;
    i <= layerConfigurations[layerConfigurations.length - 1].growEditionSizeTo;
    i++
  ) {
    abstractedIndexes.push(i);
  }
  if (shuffleLayerConfigurations) {
    abstractedIndexes = shuffle(abstractedIndexes);
  }
  debugLogs
    ? console.log("Editions left to create: ", abstractedIndexes)
    : null;

  // while循环生成
  while (layerConfigIndex < layerConfigurations.length) {
    const layers = layersSetup(
      layerConfigurations[layerConfigIndex].layersOrder
    );
    while (
      editionCount <= layerConfigurations[layerConfigIndex].growEditionSizeTo
    ) {
      let newDna = createDna(
        layers,
        layerConfigurations[layerConfigIndex].mutuallyExclusiveRules,
        layerConfigurations[layerConfigIndex].dependencyRules
      );
      if (isDnaUnique(dnaList, newDna)) {
        let results = constructLayerToDna(newDna, layers);
        let loadedElements = [];

        results.forEach((layer) => {
          loadedElements.push(loadLayerImg(layer));
        });

        await Promise.all(loadedElements).then((renderObjectArray) => {
          debugLogs ? console.log("Clearing canvas") : null;
          ctx.clearRect(0, 0, format.width, format.height);
          if (gif.export) {
            hashlipsGiffer = new HashlipsGiffer(
              canvas,
              ctx,
              `${buildDir}/gifs/${abstractedIndexes[0]}.gif`,
              gif.repeat,
              gif.quality,
              gif.delay
            );
            hashlipsGiffer.start();
          }
          if (background.generate) {
            drawBackground();
          }
          renderObjectArray.forEach((renderObject, index) => {
            drawElement(
              renderObject,
              index,
              layerConfigurations[layerConfigIndex].layersOrder.length
            );
            if (gif.export) {
              hashlipsGiffer.add();
            }
          });
          if (gif.export) {
            hashlipsGiffer.stop();
          }
          debugLogs
            ? console.log("Editions left to create: ", abstractedIndexes)
            : null;
          saveImage(abstractedIndexes[0]);
          addMetadata(newDna, abstractedIndexes[0]);
          saveMetaDataSingleFile(abstractedIndexes[0]);
          console.log(
            `Created edition: ${abstractedIndexes[0]}, with DNA: ${sha1(
              newDna
            )}`
          );
        });
        dnaList.add(filterDNAOptions(newDna));
        editionCount++;
        abstractedIndexes.shift();
      } else {
        console.log("DNA exists!");
        failedCount++;
        if (failedCount >= uniqueDnaTorrance) {
          console.log(
            `You need more layers or elements to grow your edition to ${layerConfigurations[layerConfigIndex].growEditionSizeTo} artworks!`
          );
          process.exit();
        }
      }
    }
    layerConfigIndex++;
  }
  writeMetaData(JSON.stringify(metadataList, null, 2));
};

// 导出模块
module.exports = { startCreating, buildSetup, getElements, test };

<svg viewBox="-10 -10 120 120" preserveAspectRatio="xMidYMid meet" style="width: 100%; height: 100%;">
  <defs>
    
    
    <filter height="150%" id="sh0" width="150%" x="-0.25" y="-0.25">
      <feConvolveMatrix id="3_|_y" in="SourceAlpha" result="19y" order="1,17" divisor="6632" bias="0" preserveAlpha="false" kernelMatrix=" 10 30 77 169 320 527 752 931 1000 931 752 527 320 169 77 30 10"></feConvolveMatrix>
      <feConvolveMatrix id="3_|_x" result="19x" order="17,1" divisor="6632" bias="0" preserveAlpha="false" kernelMatrix=" 10 30 77 169 320 527 752 931 1000 931 752 527 320 169 77 30 10"></feConvolveMatrix>
      <feConvolveMatrix id="9_|_y" in="SourceAlpha" result="49y" order="1,47" divisor="19856" bias="0" preserveAlpha="false" kernelMatrix=" 15 21 30 42 57 77 101 132 169 212 263 320 384 453 527 603 678 752 820 881 931 968 992 1000 992 968 931 881 820 752 678 603 527 453 384 320 263 212 169 132 101 77 57 42 30 21 15"></feConvolveMatrix>
      <feConvolveMatrix id="9_|_x" result="49x" order="47,1" divisor="19856" bias="0" preserveAlpha="false" kernelMatrix=" 15 21 30 42 57 77 101 132 169 212 263 320 384 453 527 603 678 752 820 881 931 968 992 1000 992 968 931 881 820 752 678 603 527 453 384 320 263 212 169 132 101 77 57 42 30 21 15"></feConvolveMatrix>
      <feTurbulence class="seed" result="noise" type="fractalNoise" stitchTiles="stitch" seed="43" baseFrequency="0.06 0.08 " numOctaves="3"></feTurbulence>
      <feMorphology operator="erode" radius="1.2"></feMorphology>
      <feComposite in="noise" operator="arithmetic" k1="0" k2="8" k3="0" k4="-3"></feComposite>
      <feComposite in="49x" result="49noise" operator="arithmetic" k1="0" k2="2" k3="-0.2" k4="-1"></feComposite>
      <feComposite in="49noise" in2="19x" operator="arithmetic" k1="0" k2="0.5" k3="1.5" k4="-1"></feComposite>
      <feDiffuseLighting surfaceScale="2" lighting-color="#fff">
        <feDistantLight azimuth="240" elevation="20"></feDistantLight>
      </feDiffuseLighting>
      <feComposite in2="SourceGraphic" operator="arithmetic" k1="1" k2="0" k3="0" k4="0"></feComposite>
    </filter>




    <filter height="170%" id="sh2" width="170%" x="-0.2" y="-0.2">
      <feOffset dx="0" dy="0" in="SourceAlpha"></feOffset>
      <feGaussianBlur stdDeviation="1.2"></feGaussianBlur>
      <feColorMatrix result="out" type="matrix" values=" 
               0 0 0 0 0.4         
               0 0 0 0 0.4                    
               0 0 0 0 0.4                
               0 0 0 10 0 "></feColorMatrix>
      <feMerge>
        <feMergeNode in="out"></feMergeNode>
        <feMergeNode in="SourceGraphic"></feMergeNode>
      </feMerge>
    </filter>
        <filter height="130%" id="sh1" width="130%" x="-0.2" y="-0.2">
      <feOffset dx="3" dy="4" in="SourceAlpha"></feOffset>
      <feGaussianBlur stdDeviation="3"></feGaussianBlur>
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.8 0"
      ></feColorMatrix>
      <feBlend in="SourceGraphic"></feBlend>
    </filter>

    
    <linearGradient id="svg_66" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="hsl(40, 23%, 35%)"></stop>
      <stop offset="0.4" stop-color="hsl(40, 23%, 60%)"></stop>
      <stop offset="0.65" stop-color="hsl(40, 23%, 70%)"></stop>
      <stop offset="0.75" stop-color="hsl(40, 23%, 60%)"></stop>
      <stop offset="1" stop-color="hsl(40, 23%, 35%)"></stop>
    </linearGradient>
    <circle id="bell" fill="#070" stroke="#030" r="5.5" filter="url(#sh0)"></circle>
    <g id="cap" filter="url(#sh2)">
        <path id="capPath" fill="#070" filter="url(#sh0)" stroke="#030" d="M72,89 C78.6,68 67.2,30.7 89,68 C86.9,37.6 66.91,32 62,61 C58,44.1 67.5,38.8 52,10 C53.6,47 46.91,36.2 45,61 C39.3,43.4 22,46.6 13,43 C32.9,55.8 35.7,66.62 32,89 C35,97.9 68.6,99 72,89 Z"></path>
        <use id="bell1" x="13" y="43" href="#bell"></use>
        <use id="bell2" x="52" y="10" href="#bell"></use>
        <use id="bell3" x="89" y="68" href="#bell"></use>
        <ellipse cx="52.19" cy="90.01" fill="url(#svg_66)" rx="14.76" ry="3.56"></ellipse>
        <path d="M34,86.5C36,82,53.5,81,60,83C54,81,34,81.5,34,86.5Z" fill="none" stroke="hsl(40, 23%, 60%)"></path>
    </g>
  </defs>
  <use href="#cap" />
</svg>
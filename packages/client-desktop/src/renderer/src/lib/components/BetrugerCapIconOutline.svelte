<svg viewBox="-10 -10 120 120" preserveAspectRatio="xMidYMid meet" style="width: 100%; height: 100%;">
  <defs>
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
  </defs>
  
  <g filter="url(#sh2)">
    <!-- Cap filled with background color -->
    <path fill="#2c2c2e" stroke="#666" stroke-width="1.5" d="M72,89 C78.6,68 67.2,30.7 89,68 C86.9,37.6 66.91,32 62,61 C58,44.1 67.5,38.8 52,10 C53.6,47 46.91,36.2 45,61 C39.3,43.4 22,46.6 13,43 C32.9,55.8 35.7,66.62 32,89 C35,97.9 68.6,99 72,89 Z"></path>
    
    <!-- Bell circles filled with background color -->
<circle fill="#2c2c2e" stroke="#666" stroke-width="1.5" cx="13" cy="43" r="5.5"></circle>

<circle fill="#2c2c2e" stroke="#666" stroke-width="1.5" cx="52" cy="10" r="5.5"></circle>

<circle fill="#2c2c2e" stroke="#666" stroke-width="1.5" cx="89" cy="68" r="5.5"></circle>
  </g>
</svg>
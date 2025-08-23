<script>
  export let size = 128;
  export let height = 96;
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={height}
  viewBox="0 0 128 96"
  fill="none"
>
    <!-- Background pinpad frame - fills entire button -->
    <rect x="-10" y="-10" width="148" height="116" rx="12" ry="12" fill="#312E2B" stroke="none"/>
    
    <!-- Keypad grid 3x3 enlarged to fill button -->
    <g>
        <!-- Row 1: 1, 2, 3 -->
        <rect x="6" y="6" width="36" height="26" rx="8" fill="#4a4a4a" stroke="#666666" stroke-width="1"></rect>
        <text x="24" y="22" font-family="Arial, sans-serif" font-size="18" font-weight="500" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">1</text>
        
        <rect x="46" y="6" width="36" height="26" rx="8" fill="#4a4a4a" stroke="#666666" stroke-width="1"></rect>
        <text x="64" y="22" font-family="Arial, sans-serif" font-size="18" font-weight="500" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">2</text>
        
        <rect x="86" y="6" width="36" height="26" rx="8" fill="#aa5500" stroke="#666666" stroke-width="1"></rect>
        <text x="104" y="22" font-family="Arial, sans-serif" font-size="18" font-weight="500" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">3</text>
        
        <!-- Row 2: 4, 5, 6 -->
        <rect x="6" y="35" width="36" height="26" rx="8" fill="#4a4a4a" stroke="#666666" stroke-width="1"></rect>
        <text x="24" y="51" font-family="Arial, sans-serif" font-size="18" font-weight="500" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">4</text>
        
        <rect x="46" y="35" width="36" height="26" rx="8" fill="#4a4a4a" stroke="#666666" stroke-width="1"></rect>
        <text x="64" y="51" font-family="Arial, sans-serif" font-size="18" font-weight="500" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">5</text>
        
        <rect x="86" y="35" width="36" height="26" rx="8" fill="#aa2222" stroke="#666666" stroke-width="1"></rect>
        <text x="104" y="51" font-family="Arial, sans-serif" font-size="18" font-weight="500" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">6</text>
        
        <!-- Row 3: 7, 8, 9 -->
        <rect x="6" y="64" width="36" height="26" rx="8" fill="#4a4a4a" stroke="#666666" stroke-width="1"></rect>
        <text x="24" y="80" font-family="Arial, sans-serif" font-size="18" font-weight="500" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">7</text>
        
        <rect x="46" y="64" width="36" height="26" rx="8" fill="#4a4a4a" stroke="#666666" stroke-width="1"></rect>
        <text x="64" y="80" font-family="Arial, sans-serif" font-size="18" font-weight="500" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">8</text>
        
        <rect x="86" y="64" width="36" height="26" rx="8" fill="#006633" stroke="#666666" stroke-width="1"></rect>
        <text x="104" y="80" font-family="Arial, sans-serif" font-size="18" font-weight="500" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">9</text>
    </g>
</svg>
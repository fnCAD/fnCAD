import numpy as np
import matplotlib.pyplot as plt

def smooth_union_exp(d1: np.ndarray, d2: np.ndarray, k: float) -> np.ndarray:
    # If distances are very different (> 2*radius apart), just use min
    diff = np.abs(d1 - d2)
    mask = diff > 2.0/k
    
    # For points where we'll blend:
    # 1. Subtract the min to bring closer to origin
    # 2. Do the smooth blend
    # 3. Add the min back
    minDist = np.minimum(d1, d2)
    d1_shifted = d1 - minDist
    d2_shifted = d2 - minDist
    
    smooth = -np.log(np.exp(-k*d1_shifted) + np.exp(-k*d2_shifted))/k + minDist
    simple = minDist
    
    # Use mask to select between them
    result = np.where(mask, simple, smooth)
    return result

def naive_smooth_union(d1: np.ndarray, d2: np.ndarray, k: float) -> np.ndarray:
    return -np.log(np.exp(-k*d1) + np.exp(-k*d2))/k

def main():
    # Grid parameters
    k = 20.0  # k = 1/radius
    x = np.linspace(-2, 2, 100)
    y = np.linspace(-2, 2, 100)
    X, Y = np.meshgrid(x, y)
    
    # Calculate both versions
    naive = naive_smooth_union(X, Y, k)
    optimized = smooth_union_exp(X, Y, k)
    
    # Create figure with two subplots
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))
    
    # Create figure with three subplots
    fig, (ax1, ax2, ax3) = plt.subplots(1, 3, figsize=(18, 5))
    
    # Plot naive version
    im1 = ax1.imshow(naive, extent=[-2, 2, -2, 2], origin='lower', cmap='viridis')
    ax1.set_title('Naive Smooth Union')
    plt.colorbar(im1, ax=ax1)
    
    # Plot optimized version
    im2 = ax2.imshow(optimized, extent=[-2, 2, -2, 2], origin='lower', cmap='viridis')
    ax2.set_title('Optimized Smooth Union')
    plt.colorbar(im2, ax=ax2)
    
    # Plot difference
    difference = np.abs(optimized - naive)
    im3 = ax3.imshow(difference, extent=[-2, 2, -2, 2], origin='lower', cmap='magma')
    ax3.set_title('Absolute Difference')
    plt.colorbar(im3, ax=ax3)
    
    # Add contour lines to naive and optimized plots only
    levels = np.linspace(-2, 2, 20)
    ax1.contour(X, Y, naive, levels=levels, colors='white', alpha=0.3)
    ax2.contour(X, Y, optimized, levels=levels, colors='white', alpha=0.3)
    
    # Labels and grid
    for ax in [ax1, ax2, ax3]:
        ax.set_xlabel('d1')
        ax.set_ylabel('d2')
        ax.grid(True, alpha=0.3)
    
    plt.suptitle(f'Smooth Union Comparison (k={k}, radius={1/k:.3f})')
    plt.tight_layout()
    plt.show()

if __name__ == "__main__":
    main()

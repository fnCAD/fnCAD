import numpy as np

def smooth_union_exp(d1: float, d2: float, k: float) -> float:
    # For points far from both shapes (> 2*radius), just use regular min
    minDist = min(d1, d2)
    if minDist > 1.0/k * 2.0:
        return minDist
    return -np.log(np.exp(-k*d1) + np.exp(-k*d2))/k

def naive_smooth_union(d1: float, d2: float, k: float) -> float:
    return -np.log(np.exp(-k*d1) + np.exp(-k*d2))/k

def main():
    # Test parameters
    k = 20.0  # k = 1/radius
    d1_range = np.linspace(-1, 3, 20)
    d2 = 0.0  # Fix d2 at zero for simplicity
    
    print(f"\nComparing smooth union implementations (k={k}, radius={1/k})")
    print("\nd1".ljust(10) + "naive".ljust(15) + "optimized".ljust(15) + "diff")
    print("-" * 45)
    
    for d1 in d1_range:
        naive = naive_smooth_union(d1, d2, k)
        opt = smooth_union_exp(d1, d2, k)
        diff = abs(naive - opt)
        
        print(f"{d1:8.3f}  {naive:12.6f}  {opt:12.6f}  {diff:10.2e}")

if __name__ == "__main__":
    main()

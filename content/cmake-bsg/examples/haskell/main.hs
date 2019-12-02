module Main (main) where
import Hello(hello_string)
main = do
  putStr $ hello_string ++ "\n"
